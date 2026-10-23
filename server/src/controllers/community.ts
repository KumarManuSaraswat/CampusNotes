import type { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { lectureDateSchema } from '@campusnotes/shared';
import { Note } from '../models/Note.js';
import { Vote } from '../models/Vote.js';
import { NoteRequest } from '../models/NoteRequest.js';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, ok, wrap } from '../utils/http.js';
import { reputationFor } from '../services/reputation/index.js';
const id = (s: string) => {
  if (!mongoose.isValidObjectId(s))
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid identifier.');
  return s;
};
const requestSchema = z.object({
  title: z.string().trim().min(3).max(160),
  subject: z.string().trim().min(2).max(100),
  instructor: z.string().trim().max(100).default(''),
  lectureDate: lectureDateSchema.nullable().optional(),
  description: z.string().trim().max(2000).default(''),
});
const reportSchema = z.object({
  reason: z.enum([
    'spam',
    'misleading_metadata',
    'duplicate',
    'inappropriate',
    'unauthorized_material',
  ]),
  description: z.string().trim().max(1000).default(''),
});
async function voteState(noteId: string, userId: string) {
  const [note, vote] = await Promise.all([
    Note.findById(noteId),
    Vote.findOne({ note: noteId, user: userId }),
  ]);
  if (!note) throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
  return {
    upvoteCount: note.upvoteCount,
    downvoteCount: note.downvoteCount,
    score: note.score,
    myVote: vote?.value || 0,
  };
}
async function changeVote(noteId: string, userId: string, value: -1 | 0 | 1) {
  const note = await Note.findById(id(noteId));
  if (!note) throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
  if (String(note.uploadedBy) === userId)
    throw new HttpError(403, 'SELF_VOTE', 'You cannot vote on your own note.');
  // A transaction keeps the unique vote row and denormalized note counts in sync.
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const prior = await Vote.findOne({ note: noteId, user: userId }).session(session);
        const old = prior?.value || 0;
        if (old === value) return;
        if (value === 0) await Vote.deleteOne({ note: noteId, user: userId }).session(session);
        else
          await Vote.updateOne(
            { note: noteId, user: userId },
            { $set: { value } },
            { upsert: true, session },
          );
        const incUp = (value === 1 ? 1 : 0) - (old === 1 ? 1 : 0);
        const incDown = (value === -1 ? 1 : 0) - (old === -1 ? 1 : 0);
        await Note.updateOne(
          { _id: noteId },
          { $inc: { upvoteCount: incUp, downvoteCount: incDown, score: incUp - incDown } },
          { session },
        );
      });
      return await voteState(noteId, userId);
    } catch (error: any) {
      if (
        attempt === 2 ||
        !(error?.hasErrorLabel?.('TransientTransactionError') || error?.code === 11000)
      )
        throw error;
    } finally {
      await session.endSession();
    }
  }
  throw new HttpError(503, 'RETRY', 'Please retry your vote.');
}
export function communityRoutes(router: Router) {
  router.post(
    '/notes/:id/vote',
    requireAuth,
    wrap(async (req, res) => {
      const value = z
        .object({ value: z.union([z.literal(1), z.literal(-1)]) })
        .parse(req.body).value;
      ok(res, await changeVote(req.params.id, req.actor!.id, value), 'Vote saved.');
    }),
  );
  router.delete(
    '/notes/:id/vote',
    requireAuth,
    wrap(async (req, res) =>
      ok(res, await changeVote(req.params.id, req.actor!.id, 0), 'Vote removed.'),
    ),
  );
  router.get(
    '/users/me/profile',
    requireAuth,
    wrap(async (req, res) => {
      const user = await User.findById(req.actor!.id);
      ok(res, {
        id: String(user!.id),
        name: user!.name,
        email: user!.email,
        role: user!.role,
        createdAt: user!.createdAt,
        ...(await reputationFor(req.actor!.id)),
      });
    }),
  );
  router.get(
    '/requests',
    wrap(async (req, res) => {
      const status = z.enum(['open', 'fulfilled', 'all']).catch('open').parse(req.query.status);
      const filter = status === 'all' ? {} : { status };
      const items = await NoteRequest.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .populate('createdBy', 'name')
        .populate('fulfilledBy', 'name')
        .populate('fulfilledNote', 'title');
      ok(
        res,
        items.map((r) => ({
          id: String(r.id),
          title: r.title,
          subject: r.subject,
          instructor: r.instructor,
          lectureDate: r.lectureDate?.toISOString().slice(0, 10) || null,
          description: r.description,
          status: r.status,
          createdAt: r.createdAt,
          createdBy: { id: String((r.createdBy as any).id), name: (r.createdBy as any).name },
          fulfilledBy: r.fulfilledBy
            ? { id: String((r.fulfilledBy as any).id), name: (r.fulfilledBy as any).name }
            : null,
          fulfilledNote: r.fulfilledNote
            ? { id: String((r.fulfilledNote as any).id), title: (r.fulfilledNote as any).title }
            : null,
        })),
      );
    }),
  );
  router.post(
    '/requests',
    requireAuth,
    wrap(async (req, res) => {
      const data = requestSchema.parse(req.body);
      const normalizedKey = `${data.subject.toLowerCase()}::${data.title.toLowerCase()}`;
      const item = await NoteRequest.create({
        ...data,
        normalizedKey,
        lectureDate: data.lectureDate ? new Date(data.lectureDate) : null,
        createdBy: req.actor!.id,
      });
      ok(res, { id: String(item.id) }, 'Request created.', 201);
    }),
  );
  router.patch(
    '/requests/:id/fulfill',
    requireAuth,
    wrap(async (req, res) => {
      const noteId = id(z.object({ noteId: z.string() }).parse(req.body).noteId);
      const requestId = id(req.params.id);
      const note = await Note.findById(noteId);
      if (!note) throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
      if (String(note.uploadedBy) !== req.actor!.id)
        throw new HttpError(
          403,
          'FORBIDDEN',
          'You can fulfill a request with one of your own notes.',
        );
      const request = await NoteRequest.findOneAndUpdate(
        { _id: requestId, status: 'open', createdBy: { $ne: req.actor!.id } },
        {
          $set: {
            status: 'fulfilled',
            fulfilledBy: req.actor!.id,
            fulfilledNote: noteId,
            fulfilledAt: new Date(),
          },
        },
        { new: true },
      );
      if (!request)
        throw new HttpError(
          409,
          'REQUEST_UNAVAILABLE',
          'This request is already fulfilled or cannot be fulfilled by you.',
        );
      ok(res, { id: String(request.id), status: request.status }, 'Request fulfilled.');
    }),
  );
  router.post(
    '/notes/:id/report',
    requireAuth,
    wrap(async (req, res) => {
      const noteId = id(req.params.id);
      if (!(await Note.exists({ _id: noteId })))
        throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
      const data = reportSchema.parse(req.body);
      try {
        const report = await Report.create({ ...data, note: noteId, reportedBy: req.actor!.id });
        ok(res, { id: String(report.id) }, 'Report submitted.', 201);
      } catch (error: any) {
        if (error.code === 11000)
          throw new HttpError(409, 'ALREADY_REPORTED', 'You already reported this note.');
        throw error;
      }
    }),
  );
  router.get(
    '/admin/reports',
    requireAuth,
    requireRole('moderator'),
    wrap(async (req, res) => {
      const status = z
        .enum(['open', 'reviewed', 'resolved', 'all'])
        .catch('open')
        .parse(req.query.status);
      const reports = await Report.find(status === 'all' ? {} : { status })
        .sort({ createdAt: -1 })
        .limit(100)
        .populate('note', 'title')
        .populate('reportedBy', 'name')
        .populate('reviewedBy', 'name');
      ok(
        res,
        reports.map((r) => ({
          id: String(r.id),
          note: r.note ? { id: String((r.note as any).id), title: (r.note as any).title } : null,
          reportedBy: (r.reportedBy as any)?.name,
          reason: r.reason,
          description: r.description,
          status: r.status,
          reviewedBy: (r.reviewedBy as any)?.name || null,
          reviewedAt: r.reviewedAt,
          createdAt: r.createdAt,
        })),
      );
    }),
  );
  router.patch(
    '/admin/reports/:id',
    requireAuth,
    requireRole('moderator'),
    wrap(async (req, res) => {
      const status = z.object({ status: z.enum(['reviewed', 'resolved']) }).parse(req.body).status;
      const report = await Report.findByIdAndUpdate(
        id(req.params.id),
        { $set: { status, reviewedBy: req.actor!.id, reviewedAt: new Date() } },
        { new: true },
      );
      if (!report) throw new HttpError(404, 'NOT_FOUND', 'Report not found.');
      ok(res, { id: String(report.id), status: report.status }, 'Report updated.');
    }),
  );
}
