import type { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { lectureDateSchema, metadataSchema } from '@campusnotes/shared';
import { Note } from '../models/Note.js';
import { Bookmark } from '../models/Bookmark.js';
import { assertReadable, assertPublic, publicNoteQuery } from '../services/ai/noteVisibility.js';
import {
  aiAvailable,
  processStudyNote,
  studyNoteStatus,
  ownedNote,
  gateDto,
} from '../services/ai/processStudyNote.js';
import { Vote } from '../models/Vote.js';
import { Report } from '../models/Report.js';
import { NoteRequest } from '../models/NoteRequest.js';
import { requireAuth, optionalAuth, requireRole } from '../middleware/auth.js';
import { storage, type StoredFile } from '../services/storage/cloudinary.js';
import { HttpError, ok, wrap } from '../utils/http.js';
import { readEnv } from '../config/env.js';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: readEnv().MAX_FILE_MB * 1024 * 1024, files: 10 },
});
const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const validPdfMarkers = (buffer: Buffer) =>
  buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')) &&
  buffer.subarray(-1024).includes(Buffer.from('%%EOF'));
const validId = (id: string) => {
  if (!mongoose.isValidObjectId(id))
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid note identifier.');
  return id;
};
const readable = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'Untitled notes';
const fileName = (name: string) =>
  name
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, 180) || 'notes';
const metadataInput = (body: Record<string, unknown>) =>
  metadataSchema.parse({
    ...body,
    tags:
      typeof body.tags === 'string'
        ? body.tags
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : body.tags,
    lectureDate: body.lectureDate === '' ? null : body.lectureDate,
  });
async function dto(note: any, userId?: string) {
  const owner =
    note.uploadedBy && typeof note.uploadedBy === 'object' && note.uploadedBy.name
      ? note.uploadedBy
      : null;
  const vote = userId ? await Vote.findOne({ note: note._id, user: userId }) : null;
  return {
    id: String(note.id),
    title: note.title,
    description: note.description,
    originalFilename: note.originalFilename,
    fileType: note.fileType,
    fileSize: note.fileSize,
    subject: note.subject,
    tags: note.tags,
    instructor: note.instructor,
    lectureDate: note.lectureDate?.toISOString().slice(0, 10) || null,
    semester: note.semester,
    uploadedBy: { id: String(owner ? owner.id : note.uploadedBy), name: owner?.name || 'Student' },
    processingStatus: note.processingStatus,
    studyGateStatus: note.studyGateStatus || 'legacy_unreviewed',
    studyAssessment: note.studyAssessment ?? null,
    reviewRequestedAt: note.reviewRequestedAt?.toISOString() ?? null,
    reviewMessage: note.reviewMessage || '',
    metadataSource: note.metadataSource,
    upvoteCount: note.upvoteCount,
    downvoteCount: note.downvoteCount,
    score: note.score,
    myVote: vote?.value || 0,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    previewUrl: `/notes/${note.id}/file`,
    downloadUrl: `/notes/${note.id}/file?download=1`,
  };
}
async function getNote(id: string) {
  const note = await Note.findById(validId(id)).populate('uploadedBy', 'name');
  if (!note) throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
  return note;
}
const filterSchema = z.object({
  q: z.string().max(100).optional(),
  subject: z.string().max(100).optional(),
  tag: z.string().max(40).optional(),
  instructor: z.string().max(100).optional(),
  fileType: z.enum(['pdf', 'image']).optional(),
  semester: z.string().max(40).optional(),
  date: lectureDateSchema.optional(),
  sort: z.enum(['recent', 'score']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});
const escaped = (s: string) =>
  Array.from(s)
    .map((ch) => ('\\^$.*+?()[]{}|'.includes(ch) ? '\\' + ch : ch))
    .join('');
export function noteRoutes(router: Router) {
  router.get('/ai/capabilities', requireAuth, (_req, res) => ok(res, { enabled: aiAvailable() }));
  router.get(
    '/users/me/saved-notes',
    requireAuth,
    wrap(async (req, res) => {
      const saved = await Bookmark.find({ user: req.actor!.id }).sort({ createdAt: -1 });
      const notes = await Note.find({
        _id: { $in: saved.map((x) => x.note) },
        ...publicNoteQuery,
      }).populate('uploadedBy', 'name');
      const byId = new Map(notes.map((n) => [String(n.id), n]));
      ok(
        res,
        await Promise.all(
          saved.flatMap((s) => {
            const n = byId.get(String(s.note));
            return n ? [dto(n, req.actor!.id)] : [];
          }),
        ),
      );
    }),
  );
  router.put(
    '/notes/:id/bookmark',
    requireAuth,
    wrap(async (req, res) => {
      const note = await getNote(req.params.id);
      assertPublic(note);
      await Bookmark.updateOne(
        { user: req.actor!.id, note: note._id },
        { $setOnInsert: { user: req.actor!.id, note: note._id } },
        { upsert: true },
      );
      ok(res, null, 'Note saved.');
    }),
  );
  router.delete(
    '/notes/:id/bookmark',
    requireAuth,
    wrap(async (req, res) => {
      await Bookmark.deleteOne({ user: req.actor!.id, note: validId(req.params.id) });
      ok(res, null, 'Note removed from saved notes.');
    }),
  );
  router.post(
    '/notes',
    requireAuth,
    upload.array('files', 10),
    wrap(async (req, res) => {
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length === 0)
        throw new HttpError(400, 'FILE_REQUIRED', 'Choose at least one PDF, JPG, or PNG file.');

      const data = metadataInput(req.body);
      const validated: Array<{ file: Express.Multer.File; mime: string }> = [];
      for (const file of files) {
        const detected = await fileTypeFromBuffer(file.buffer);
        const extension = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
        const validExtension =
          detected?.mime === 'application/pdf'
            ? extension === '.pdf'
            : detected?.mime === 'image/png'
              ? extension === '.png'
              : extension === '.jpg' || extension === '.jpeg';
        const declaredTypeAllowed =
          !file.mimetype ||
          file.mimetype === 'application/octet-stream' ||
          detected?.mime === file.mimetype;
        if (
          !detected ||
          !allowed.has(detected.mime) ||
          !declaredTypeAllowed ||
          !validExtension ||
          (detected.mime === 'application/pdf' && !validPdfMarkers(file.buffer))
        )
          throw new HttpError(
            400,
            'INVALID_FILE',
            'The file content and extension must be a PDF, JPG, or PNG.',
          );
        validated.push({ file, mime: detected.mime });
      }

      const storedFiles: StoredFile[] = [];
      const createdNotes: Array<Awaited<ReturnType<typeof Note.create>>[number]> = [];
      try {
        for (const { file, mime } of validated) {
          let stored;
          try {
            stored = await storage.upload(file.buffer, mime);
          } catch {
            throw new HttpError(503, 'STORAGE_ERROR', 'Upload failed. Please retry in a moment.');
          }
          storedFiles.push(stored);
          const originalFilename = fileName(file.originalname);
          const note = await Note.create({
            ...data,
            title: data.title || readable(originalFilename),
            originalFilename,
            fileType: mime,
            fileSize: file.size,
            ...stored,
            uploadedBy: req.actor!.id,
            studyGateStatus: 'pending',
            metadataSource: Object.values(data).some((x) => (Array.isArray(x) ? x.length : !!x))
              ? 'manual'
              : 'filename',
          });
          createdNotes.push(note);
          await note.populate('uploadedBy', 'name');
        }
      } catch (error) {
        const noteIds = createdNotes.map((note) => note._id);
        console.error('Batch note upload failed; starting cleanup.', {
          fileCount: validated.length,
          createdNoteCount: createdNotes.length,
          error,
        });

        if (noteIds.length > 0) {
          try {
            await Note.deleteMany({ _id: { $in: noteIds } });
          } catch (cleanupError) {
            console.error('Batch MongoDB note cleanup failed.', {
              noteIds,
              error: cleanupError,
            });
          }
        }

        const cleanupResults = await Promise.allSettled(
          storedFiles.map((stored) => storage.remove(stored)),
        );
        cleanupResults.forEach((result, index) => {
          if (result.status === 'rejected')
            console.error('Batch Cloudinary cleanup failed.', {
              storagePublicId: storedFiles[index].storagePublicId,
              error: result.reason,
            });
        });

        throw error;
      }

      const response = await Promise.all(createdNotes.map((note) => dto(note, req.actor!.id)));
      ok(res, response, 'Notes uploaded.', 201);
    }),
  );
  router.get(
    '/notes',
    wrap(async (req, res) => {
      const f = filterSchema.parse(req.query);
      const query: any = { ...publicNoteQuery };
      if (f.q) query.$text = { $search: f.q };
      const clauses: any[] = [];
      if (f.subject)
        clauses.push({
          $or: [
            { subject: new RegExp(escaped(f.subject), 'i') },
            { 'studyAssessment.subject': new RegExp(escaped(f.subject), 'i') },
            { 'studyAssessment.category': new RegExp(escaped(f.subject), 'i') },
          ],
        });
      if (f.tag)
        clauses.push({
          $or: [
            { tags: new RegExp(escaped(f.tag), 'i') },
            { 'studyAssessment.tags': new RegExp(escaped(f.tag), 'i') },
          ],
        });
      if (clauses.length) query.$and = clauses;
      if (f.fileType)
        query.fileType =
          f.fileType === 'pdf' ? 'application/pdf' : { $in: ['image/png', 'image/jpeg'] };
      if (f.semester) query.semester = new RegExp(escaped(f.semester), 'i');
      if (f.instructor) query.instructor = new RegExp(escaped(f.instructor), 'i');
      if (f.date) {
        const start = new Date(f.date + 'T00:00:00.000Z');
        query.lectureDate = { $gte: start, $lt: new Date(start.getTime() + 86400000) };
      }
      const [notes, total] = await Promise.all([
        Note.find(query)
          .sort(f.sort === 'score' ? { score: -1, createdAt: -1 } : { createdAt: -1 })
          .skip((f.page - 1) * f.limit)
          .limit(f.limit)
          .populate('uploadedBy', 'name'),
        Note.countDocuments(query),
      ]);
      ok(res, {
        items: await Promise.all(notes.map((n) => dto(n))),
        total,
        page: f.page,
        pages: Math.ceil(total / f.limit),
      });
    }),
  );
  router.get(
    '/users/me/notes',
    requireAuth,
    wrap(async (req, res) => {
      const notes = await Note.find({ uploadedBy: req.actor!.id })
        .sort({ createdAt: -1 })
        .populate('uploadedBy', 'name');
      ok(res, await Promise.all(notes.map((n) => dto(n, req.actor!.id))));
    }),
  );
  router.get(
    '/notes/:id',
    optionalAuth,
    wrap(async (req, res) => {
      const note = await getNote(req.params.id);
      assertReadable(note, req.actor);
      ok(res, await dto(note, req.actor?.id));
    }),
  );
  router.get(
    '/notes/:id/file',
    optionalAuth,
    wrap(async (req, res) => {
      const note = await getNote(req.params.id);
      assertReadable(note, req.actor);
      if (
        note.storageProvider !== 'cloudinary' ||
        !note.storagePublicId ||
        !['raw', 'image'].includes(note.storageResourceType)
      )
        throw new HttpError(404, 'FILE_UNAVAILABLE', 'The original file is unavailable.');
      let data: Buffer;
      try {
        data = await storage.read(
          {
            storagePublicId: note.storagePublicId,
            storageResourceType: note.storageResourceType as 'raw' | 'image',
            storageProvider: 'cloudinary',
          },
          note.fileType,
        );
      } catch {
        throw new HttpError(502, 'FILE_UNAVAILABLE', 'The original file could not be retrieved.');
      }
      const detected = await fileTypeFromBuffer(data);
      if (
        !detected ||
        detected.mime !== note.fileType ||
        !allowed.has(detected.mime) ||
        (detected.mime === 'application/pdf' && !validPdfMarkers(data))
      )
        throw new HttpError(502, 'FILE_INVALID', 'The stored original is not a valid document.');
      const disposition = req.query.download === '1' ? 'attachment' : 'inline';
      const safeName = fileName(note.originalFilename);
      const fallbackName = `download.${
        detected.mime === 'application/pdf' ? 'pdf' : detected.mime === 'image/jpeg' ? 'jpg' : 'png'
      }`;
      const encodedName = encodeURIComponent(safeName).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      res
        .status(200)
        .set({
          'Content-Type': detected.mime,
          'Content-Length': String(data.length),
          'Content-Disposition': `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        })
        .send(data);
    }),
  );
  router.patch(
    '/notes/:id',
    requireAuth,
    wrap(async (req, res) => {
      const note = await getNote(req.params.id);
      if (String(note.uploadedBy._id) !== req.actor!.id)
        throw new HttpError(403, 'FORBIDDEN', 'Only the uploader can edit this note.');
      const data = metadataInput({
        title: note.title,
        subject: note.subject,
        tags: note.tags,
        instructor: note.instructor,
        lectureDate: note.lectureDate?.toISOString().slice(0, 10) || null,
        semester: note.semester,
        description: note.description,
        ...req.body,
      });
      Object.assign(note, data, {
        title: data.title || readable(note.originalFilename),
        lectureDate: data.lectureDate ? new Date(data.lectureDate) : null,
        metadataSource: 'manual',
      });
      await note.save();
      ok(res, await dto(note, req.actor!.id), 'Note updated.');
    }),
  );
  router.delete(
    '/notes/:id',
    requireAuth,
    wrap(async (req, res) => {
      const note = await getNote(req.params.id);
      if (String(note.uploadedBy._id) !== req.actor!.id)
        throw new HttpError(403, 'FORBIDDEN', 'Only the uploader can delete this note.');
      if (await NoteRequest.exists({ fulfilledNote: note.id, status: 'fulfilled' }))
        throw new HttpError(
          409,
          'NOTE_IN_USE',
          'This note fulfills a request and cannot be deleted.',
        );
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await Note.deleteOne({ _id: note.id }, { session });
          await Vote.deleteMany({ note: note.id }, { session });
          await Report.deleteMany({ note: note.id }, { session });
          await Bookmark.deleteMany({ note: note.id }, { session });
        });
      } finally {
        await session.endSession();
      }
      await storage
        .remove({
          storagePublicId: note.storagePublicId,
          storageResourceType: note.storageResourceType as 'raw' | 'image',
          storageProvider: 'cloudinary',
        })
        .catch((e) => console.error('Storage cleanup failed', e));
      ok(res, null, 'Note deleted.');
    }),
  );
  router.post(
    '/notes/:id/ai-process',
    requireAuth,
    wrap(async (req, res) => {
      ok(res, await processStudyNote(req.params.id, req.actor!.id), 'Analysis state updated.');
    }),
  );
  router.get(
    '/notes/:id/ai-status',
    requireAuth,
    wrap(async (req, res) => {
      ok(res, await studyNoteStatus(req.params.id, req.actor!.id));
    }),
  );
  router.post(
    '/notes/:id/request-review',
    requireAuth,
    wrap(async (req, res) => {
      await studyNoteStatus(req.params.id, req.actor!.id);
      const note = await Note.findOneAndUpdate(
        {
          _id: req.params.id,
          uploadedBy: req.actor!.id,
          studyGateStatus: { $ne: 'approved' },
          processingStatus: { $ne: 'pending' },
          reviewRequestedAt: null,
        },
        {
          $set: {
            reviewRequestedAt: new Date(),
            reviewMessage: 'Your review request is in the moderator queue.',
          },
        },
        { new: true },
      );
      if (!note)
        throw new HttpError(
          409,
          'REVIEW_UNAVAILABLE',
          'This note is approved, being analysed, or already awaiting review.',
        );
      ok(res, gateDto(note), 'Review requested.');
    }),
  );
  router.post(
    '/notes/:id/apply-suggestions',
    requireAuth,
    wrap(async (req, res) => {
      const note = await ownedNote(req.params.id, req.actor!.id);
      if (note.studyGateStatus !== 'approved' || note.studyAssessment?.decision !== 'academic')
        throw new HttpError(409, 'NO_SUGGESTIONS', 'No approved suggestions are available.');
      const updated = await Note.findOneAndUpdate(
        {
          _id: note._id,
          uploadedBy: req.actor!.id,
          studyGateStatus: 'approved',
          studyGateInputVersion: note.studyGateInputVersion,
        },
        {
          $set: {
            subject: note.studyAssessment.subject,
            tags: note.studyAssessment.tags.map((x: string) => x.slice(0, 40)),
            metadataSource: 'ai_reviewed',
          },
        },
        { new: true },
      );
      if (!updated)
        throw new HttpError(409, 'STALE_ATTEMPT', 'Refresh this note before applying suggestions.');
      await updated.populate('uploadedBy', 'name');
      ok(res, await dto(updated, req.actor!.id));
    }),
  );
  router.get(
    '/admin/study-reviews',
    requireAuth,
    requireRole('moderator'),
    wrap(async (_req, res) => {
      const notes = await Note.find({
        reviewRequestedAt: { $ne: null },
        studyGateStatus: { $ne: 'approved' },
      })
        .sort({ reviewRequestedAt: 1 })
        .limit(100)
        .populate('uploadedBy', 'name');
      ok(res, await Promise.all(notes.map((n) => dto(n))));
    }),
  );
  router.patch(
    '/admin/study-reviews/:id',
    requireAuth,
    requireRole('moderator'),
    wrap(async (req, res) => {
      const { decision, reason } = z
        .object({
          decision: z.enum(['approved', 'rejected']),
          reason: z.string().trim().min(5).max(320),
        })
        .parse(req.body);
      const note = await Note.findById(validId(req.params.id));
      if (!note) throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
      if (String(note.uploadedBy) === req.actor!.id)
        throw new HttpError(403, 'SELF_REVIEW', 'Another moderator must review your upload.');
      const updated = await Note.findOneAndUpdate(
        {
          _id: note._id,
          reviewRequestedAt: { $ne: null },
          processingStatus: { $ne: 'pending' },
          studyGateStatus: { $ne: 'approved' },
        },
        {
          $set: {
            studyGateStatus: decision,
            studyGateReviewedAt: new Date(),
            reviewRequestedAt: null,
            reviewMessage: reason,
            reviewedBy: req.actor!.id,
            studyGateAttemptId: null,
          },
        },
        { new: true },
      );
      if (!updated)
        throw new HttpError(409, 'REVIEW_UNAVAILABLE', 'This review is no longer pending.');
      ok(res, gateDto(updated), 'Review saved.');
    }),
  );
}
