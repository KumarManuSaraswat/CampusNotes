import type { Response, Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
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
import { combineImagePages } from '../services/ai/generatePdf.js';
import { suggestSummary } from '../services/ai/suggestSummary.js';
import { suggestPageOrder } from '../services/ai/suggestPageOrder.js';
import { PDFDocument } from 'pdf-lib';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.min(readEnv().MAX_FILE_MB, 10) * 1024 * 1024, files: 10 },
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
    publicationStatus: note.assets?.length
      ? note.publicationStatus
      : note.studyGateStatus === 'approved'
        ? 'published'
        : 'draft',
    processingStage: note.processingStage || 'upload',
    assets:
      note.assets?.map((asset: any) => ({
        id: asset.id,
        originalFilename: asset.originalFilename,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        uploadIndex: asset.uploadIndex,
        confirmedPosition: asset.confirmedPosition ?? null,
        extractionStatus: asset.extractionStatus,
        extractionWarnings: asset.extractionWarnings || [],
        usedVision: !!asset.usedVision,
        previewUrl: `/notes/${note.id}/assets/${asset.id}/file`,
        downloadUrl: `/notes/${note.id}/assets/${asset.id}/file?download=1`,
      })) || [],
    aiMetadata: note.aiMetadata || null,
    studySummary: note.studySummary || '',
    aiStudySummary: note.aiStudySummary || '',
    summarySources: note.summarySources || [],
    generatedPdfUrl: note.generatedPdf ? `/notes/${note.id}/generated-pdf` : null,
    orderConfirmedAt: note.orderConfirmedAt?.toISOString() ?? null,
    aiPageOrder: note.aiPageOrder || null,
    reviewRequestedAt: note.reviewRequestedAt?.toISOString() ?? null,
    reviewMessage: note.reviewMessage || '',
    processingError:
      userId === String(owner ? owner.id : note.uploadedBy) && note.studyGateStatus === 'failed'
        ? (note.processingError ?? null)
        : undefined,
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
  const note = await Note.findById(validId(id))
    .select('+processingError')
    .populate('uploadedBy', 'name');
  if (!note) throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
  return note;
}
async function sendStoredFile(
  res: Response,
  file: {
    storageProvider: string;
    storagePublicId: string;
    storageResourceType: string;
    mimeType: string;
    originalFilename: string;
  },
  download: boolean,
) {
  if (
    file.storageProvider !== 'cloudinary' ||
    !file.storagePublicId ||
    !['raw', 'image'].includes(file.storageResourceType)
  )
    throw new HttpError(404, 'FILE_UNAVAILABLE', 'The original file is unavailable.');
  let data: Buffer;
  try {
    data = await storage.read(
      {
        storagePublicId: file.storagePublicId,
        storageResourceType: file.storageResourceType as 'raw' | 'image',
        storageProvider: 'cloudinary',
      },
      file.mimeType,
    );
  } catch {
    throw new HttpError(502, 'FILE_UNAVAILABLE', 'The original file could not be retrieved.');
  }
  const detected = await fileTypeFromBuffer(data);
  if (
    !detected ||
    detected.mime !== file.mimeType ||
    !allowed.has(detected.mime) ||
    (detected.mime === 'application/pdf' && !validPdfMarkers(data))
  )
    throw new HttpError(502, 'FILE_INVALID', 'The stored original is not a valid document.');
  const safeName = fileName(file.originalFilename);
  const fallbackName = `download.${detected.mime === 'application/pdf' ? 'pdf' : detected.mime === 'image/jpeg' ? 'jpg' : 'png'}`;
  const encodedName = encodeURIComponent(safeName).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  res
    .status(200)
    .set({
      'Content-Type': detected.mime,
      'Content-Length': String(data.length),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    })
    .send(data);
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
      const submissionKey = req.body.submissionKey
        ? z.string().uuid().parse(req.body.submissionKey)
        : undefined;
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
      if (files.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024)
        throw new HttpError(400, 'FILE_TOO_LARGE', 'A note can contain at most 30 MB of files.');
      if (validated.length > 1 && validated.some(({ mime }) => mime === 'application/pdf'))
        throw new HttpError(400, 'MIXED_FILES', 'Upload one PDF or up to ten images per note.');
      const digest = createHash('sha256').update(JSON.stringify(data));
      for (const { file, mime } of validated)
        digest.update(fileName(file.originalname)).update(mime).update(file.buffer);
      const submissionDigest = digest.digest('hex');
      if (submissionKey) {
        const existing = await Note.findOne({ uploadedBy: req.actor!.id, submissionKey })
          .select('+submissionDigest')
          .populate('uploadedBy', 'name');
        if (existing) {
          if (existing.submissionDigest !== submissionDigest)
            throw new HttpError(
              409,
              'SUBMISSION_CONFLICT',
              'This upload identifier belongs to a different set of files.',
            );
          return ok(res, [await dto(existing, req.actor!.id)], 'Upload already saved.');
        }
      }

      const storedFiles: StoredFile[] = [];
      let createdNote: any = null;
      try {
        for (const { file, mime } of validated) {
          let stored;
          try {
            stored = await storage.upload(file.buffer, mime);
          } catch {
            throw new HttpError(503, 'STORAGE_ERROR', 'Upload failed. Please retry in a moment.');
          }
          storedFiles.push(stored);
        }
        const first = validated[0];
        const originalFilename = fileName(first.file.originalname);
        createdNote = await Note.create({
          ...data,
          title: data.title || readable(originalFilename),
          originalFilename,
          fileType: first.mime,
          fileSize: first.file.size,
          ...storedFiles[0],
          assets: validated.map(({ file, mime }, index) => ({
            id: randomUUID(),
            originalFilename: fileName(file.originalname),
            mimeType: mime,
            fileSize: file.size,
            ...storedFiles[index],
            uploadIndex: index,
            confirmedPosition: validated.length === 1 ? 0 : null,
            inputVersion: 1,
          })),
          submissionKey,
          submissionDigest,
          uploadedBy: req.actor!.id,
          studyGateStatus: 'pending',
          publicationStatus: 'draft',
          processingEvents: [
            {
              step: 'upload',
              status: 'completed',
              at: new Date(),
              message: `${validated.length} original file(s) saved.`,
            },
          ],
          metadataSource: Object.values(data).some((x) => (Array.isArray(x) ? x.length : !!x))
            ? 'manual'
            : 'filename',
        });
        await createdNote.populate('uploadedBy', 'name');
      } catch (error) {
        console.error('Batch note upload failed; starting cleanup.', {
          fileCount: validated.length,
          createdNoteCount: createdNote ? 1 : 0,
          errorCode: error instanceof HttpError ? error.code : 'UPLOAD_FAILED',
        });

        if (createdNote) {
          try {
            await Note.deleteOne({ _id: createdNote._id });
          } catch {
            console.error('Batch MongoDB note cleanup failed.', {
              noteId: createdNote._id,
              errorCode: 'CLEANUP_FAILED',
            });
          }
        }

        const cleanupResults = await Promise.allSettled(
          storedFiles.map((stored) => storage.remove(stored)),
        );
        cleanupResults.forEach((result, index) => {
          if (result.status === 'rejected')
            console.error('Batch Cloudinary cleanup failed.', {
              fileIndex: index,
              errorCode: 'CLEANUP_FAILED',
            });
        });

        if ((error as { code?: number })?.code === 11000 && submissionKey) {
          const existing = await Note.findOne({ uploadedBy: req.actor!.id, submissionKey })
            .select('+submissionDigest')
            .populate('uploadedBy', 'name');
          if (existing?.submissionDigest === submissionDigest)
            return ok(res, [await dto(existing, req.actor!.id)], 'Upload already saved.');
          throw new HttpError(
            409,
            'SUBMISSION_CONFLICT',
            'This upload identifier belongs to a different set of files.',
          );
        }
        throw error;
      }

      ok(res, [await dto(createdNote!, req.actor!.id)], 'Draft note uploaded.', 201);
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
        .select('+processingError')
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
      await sendStoredFile(
        res,
        {
          storageProvider: note.storageProvider,
          storagePublicId: note.storagePublicId,
          storageResourceType: note.storageResourceType,
          mimeType: note.fileType,
          originalFilename: note.originalFilename,
        },
        req.query.download === '1',
      );
    }),
  );
  router.get(
    '/notes/:id/assets/:assetId/file',
    optionalAuth,
    wrap(async (req, res) => {
      const note = await getNote(req.params.id);
      assertReadable(note, req.actor);
      const asset = note.assets?.find((item) => item.id === req.params.assetId);
      if (!asset) throw new HttpError(404, 'FILE_UNAVAILABLE', 'File not found.');
      await sendStoredFile(
        res,
        {
          storageProvider: 'cloudinary',
          storagePublicId: asset.storagePublicId,
          storageResourceType: asset.storageResourceType,
          mimeType: asset.mimeType,
          originalFilename: asset.originalFilename,
        },
        req.query.download === '1',
      );
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
      const originals = note.assets?.length
        ? note.assets.map((asset) => ({
            storagePublicId: asset.storagePublicId,
            storageResourceType: asset.storageResourceType,
            storageProvider: 'cloudinary' as const,
          }))
        : [
            {
              storagePublicId: note.storagePublicId,
              storageResourceType: note.storageResourceType as 'raw' | 'image',
              storageProvider: 'cloudinary' as const,
            },
          ];
      await Promise.allSettled(originals.map((file) => storage.remove(file)));
      if (note.generatedPdf) await storage.remove(note.generatedPdf as StoredFile).catch(() => {});
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
  router.get(
    '/notes/:id/processing-status',
    requireAuth,
    wrap(async (req, res) => ok(res, await studyNoteStatus(req.params.id, req.actor!.id))),
  );
  router.get(
    '/notes/:id/ai-report',
    requireAuth,
    wrap(async (req, res) => {
      const note = await ownedNote(req.params.id, req.actor!.id);
      ok(res, {
        noteId: String(note.id),
        fileCount: note.assets?.length || 1,
        files:
          note.assets?.map((asset) => ({
            id: asset.id,
            name: asset.originalFilename,
            mimeType: asset.mimeType,
            readStatus: asset.extractionStatus,
            usedVision: asset.usedVision,
            warnings: asset.extractionWarnings,
          })) || [],
        screening: note.studyAssessment || null,
        studyGateStatus: note.studyGateStatus,
        processingStatus: note.processingStatus,
        processingStage: note.processingStage,
        metadataSuggested: !!note.aiMetadata,
        metadataSuggestion: note.aiMetadata || null,
        approvedMetadata: {
          title: note.title,
          subject: note.subject,
          tags: note.tags,
          description: note.description,
          instructor: note.instructor,
          lectureDate: note.lectureDate?.toISOString().slice(0, 10) || null,
        },
        unknownFields: [
          !note.instructor && 'instructor',
          !note.lectureDate && 'lecture date',
        ].filter(Boolean),
        pageOrderSuggestion: note.aiPageOrder || null,
        pageOrderConfirmed: !!note.orderConfirmedAt,
        pdfReady: !!note.generatedPdf,
        summaryReady: !!note.studySummary,
        summaryAiSuggested: !!note.aiStudySummary,
        publicationStatus: note.publicationStatus,
        events: note.processingEvents || [],
      });
    }),
  );
  router.patch(
    '/notes/:id/review',
    requireAuth,
    wrap(async (req, res) => {
      const note = await ownedNote(req.params.id, req.actor!.id);
      if (note.publicationStatus === 'published')
        throw new HttpError(409, 'ALREADY_PUBLISHED', 'This note is already published.');
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
      const studySummary =
        req.body.studySummary === undefined
          ? undefined
          : z.string().trim().max(3000).parse(req.body.studySummary);
      const updated = await Note.findOneAndUpdate(
        {
          _id: note.id,
          uploadedBy: req.actor!.id,
          studyGateInputVersion: note.studyGateInputVersion,
          publicationStatus: 'draft',
        },
        {
          $set: {
            title: data.title || note.title,
            subject: data.subject,
            tags: [...new Set(data.tags.map((tag) => tag.trim()))],
            instructor: data.instructor,
            lectureDate: data.lectureDate ? new Date(data.lectureDate) : null,
            semester: data.semester,
            description: data.description,
            metadataSource: 'manual',
            ...(studySummary === undefined ? {} : { studySummary }),
          },
          $push: {
            processingEvents: {
              step: 'review',
              status: 'completed',
              at: new Date(),
              message: 'Student reviewed metadata.',
            },
          },
        },
        { new: true },
      );
      if (!updated) throw new HttpError(409, 'STALE_REVIEW', 'Refresh this note before saving.');
      await updated.populate('uploadedBy', 'name');
      ok(res, await dto(updated, req.actor!.id), 'Review saved.');
    }),
  );
  router.post(
    '/notes/:id/confirm-order',
    requireAuth,
    wrap(async (req, res) => {
      const { orderedAssetIds } = z
        .object({ orderedAssetIds: z.array(z.string().uuid()).min(1).max(10) })
        .parse(req.body);
      const note = await ownedNote(req.params.id, req.actor!.id);
      if (!note.assets?.length || note.publicationStatus === 'published')
        throw new HttpError(409, 'ORDER_UNAVAILABLE', 'This draft has no editable pages.');
      if (note.generatedPdf)
        throw new HttpError(
          409,
          'ORDER_LOCKED',
          'The combined PDF already uses the confirmed order.',
        );
      const expected = new Set(note.assets.map((asset) => asset.id));
      if (
        expected.size !== orderedAssetIds.length ||
        new Set(orderedAssetIds).size !== orderedAssetIds.length ||
        orderedAssetIds.some((assetId) => !expected.has(assetId))
      )
        throw new HttpError(
          400,
          'INVALID_ORDER',
          'Order must contain every uploaded page exactly once.',
        );
      const positions = new Map(orderedAssetIds.map((assetId, index) => [assetId, index]));
      note.assets.forEach((asset) => {
        asset.confirmedPosition = positions.get(asset.id)!;
      });
      note.orderConfirmedAt = new Date();
      note.processingEvents.push({
        step: 'page_order',
        status: 'completed',
        at: new Date(),
        message: 'Student confirmed page order.',
      });
      await note.save();
      await note.populate('uploadedBy', 'name');
      ok(res, await dto(note, req.actor!.id), 'Page order confirmed.');
    }),
  );
  router.post(
    '/notes/:id/suggest-order',
    requireAuth,
    wrap(async (req, res) => {
      if (!aiAvailable())
        throw new HttpError(503, 'AI_NOT_CONFIGURED', 'AI suggestions are unavailable.');
      const note = await ownedNote(req.params.id, req.actor!.id);
      if (
        note.publicationStatus === 'published' ||
        note.generatedPdf ||
        !note.assets ||
        note.assets.length < 2 ||
        note.assets.some((asset) => asset.extractionStatus !== 'completed')
      )
        throw new HttpError(
          409,
          'ORDER_UNAVAILABLE',
          'Read all image pages before requesting an order suggestion.',
        );
      if (note.aiPageOrder) {
        await note.populate('uploadedBy', 'name');
        return ok(res, await dto(note, req.actor!.id), 'Page order suggestion already ready.');
      }
      const attemptId = randomUUID();
      const claimed = await Note.findOneAndUpdate(
        {
          _id: note.id,
          uploadedBy: req.actor!.id,
          aiPageOrder: null,
          $or: [{ orderAttemptId: null }, { orderExpiresAt: { $lte: new Date() } }],
        },
        { $set: { orderAttemptId: attemptId, orderExpiresAt: new Date(Date.now() + 60_000) } },
        { new: true },
      );
      if (!claimed)
        throw new HttpError(409, 'ORDER_IN_PROGRESS', 'Order suggestion is already running.');
      try {
        const suggestion = await suggestPageOrder(
          claimed.assets!.map((asset) => ({
            id: asset.id,
            extractedText: asset.extractedText ?? null,
          })),
        );
        const saved = await Note.findOneAndUpdate(
          {
            _id: note.id,
            orderAttemptId: attemptId,
            studyGateInputVersion: claimed.studyGateInputVersion,
          },
          {
            $set: { aiPageOrder: suggestion, orderAttemptId: null, orderExpiresAt: null },
            $push: {
              processingEvents: {
                step: 'page_order',
                status: 'suggested',
                at: new Date(),
                message: 'AI suggested a page sequence. Student confirmation is still required.',
              },
            },
          },
          { new: true },
        );
        if (!saved) throw new Error('STALE_ORDER_ATTEMPT');
        await saved.populate('uploadedBy', 'name');
        ok(res, await dto(saved, req.actor!.id), 'Page order suggestion ready.');
      } catch {
        await Note.updateOne(
          { _id: note.id, orderAttemptId: attemptId },
          {
            $set: { orderAttemptId: null, orderExpiresAt: null },
            $push: {
              processingEvents: {
                step: 'page_order',
                status: 'failed',
                at: new Date(),
                message: 'AI order suggestion was unavailable; upload order is retained.',
              },
            },
          },
        );
        throw new HttpError(
          422,
          'ORDER_UNAVAILABLE',
          'Could not suggest a reliable order. Set the order manually.',
        );
      }
    }),
  );
  router.post(
    '/notes/:id/generate-pdf',
    requireAuth,
    wrap(async (req, res) => {
      const note = await ownedNote(req.params.id, req.actor!.id);
      if (
        note.publicationStatus !== 'draft' ||
        !note.assets ||
        note.assets.length < 2 ||
        note.assets.some((asset) => !asset.mimeType.startsWith('image/'))
      )
        throw new HttpError(
          409,
          'PDF_UNAVAILABLE',
          'A combined PDF requires multiple image pages.',
        );
      if (!note.orderConfirmedAt || note.assets.some((asset) => asset.confirmedPosition === null))
        throw new HttpError(409, 'ORDER_REQUIRED', 'Confirm the final page order first.');
      if (note.generatedPdf) {
        await note.populate('uploadedBy', 'name');
        return ok(res, await dto(note, req.actor!.id), 'Combined PDF already ready.');
      }
      const attemptId = randomUUID();
      const claimed = await Note.findOneAndUpdate(
        {
          _id: note.id,
          uploadedBy: req.actor!.id,
          generatedPdf: null,
          $or: [{ pdfGenerationAttemptId: null }, { pdfGenerationExpiresAt: { $lte: new Date() } }],
        },
        {
          $set: {
            pdfGenerationAttemptId: attemptId,
            pdfGenerationExpiresAt: new Date(Date.now() + 120_000),
          },
        },
        { new: true },
      );
      if (!claimed)
        throw new HttpError(409, 'PDF_IN_PROGRESS', 'PDF generation is already running.');
      let uploaded: StoredFile | null = null;
      try {
        const ordered = claimed
          .assets!.slice()
          .sort((a, b) => a.confirmedPosition! - b.confirmedPosition!);
        if (new Set(ordered.map((asset) => asset.confirmedPosition)).size !== ordered.length)
          throw new Error('INVALID_ORDER');
        const pages = [];
        for (const asset of ordered) {
          const bytes = await storage.read(
            {
              storageProvider: 'cloudinary',
              storagePublicId: asset.storagePublicId,
              storageResourceType: asset.storageResourceType,
            },
            asset.mimeType,
          );
          const detected = await fileTypeFromBuffer(bytes);
          if (detected?.mime !== asset.mimeType) throw new Error('INVALID_SOURCE');
          pages.push({ bytes, mimeType: asset.mimeType as 'image/jpeg' | 'image/png' });
        }
        const pdf = await combineImagePages(pages);
        uploaded = await storage.upload(pdf, 'application/pdf');
        const verified = await storage.read(uploaded, 'application/pdf', 35 * 1024 * 1024);
        if (
          !validPdfMarkers(verified) ||
          (await PDFDocument.load(verified)).getPageCount() !== ordered.length
        )
          throw new Error('INVALID_GENERATED_PDF');
        const saved = await Note.findOneAndUpdate(
          {
            _id: note.id,
            pdfGenerationAttemptId: attemptId,
            studyGateInputVersion: claimed.studyGateInputVersion,
          },
          {
            $set: {
              generatedPdf: uploaded,
              pdfGenerationAttemptId: null,
              pdfGenerationExpiresAt: null,
            },
            $push: {
              processingEvents: {
                step: 'pdf',
                status: 'completed',
                at: new Date(),
                message: `Combined PDF generated from ${ordered.length} confirmed image pages.`,
              },
            },
          },
          { new: true },
        );
        if (!saved) throw new Error('STALE_PDF_ATTEMPT');
        await saved.populate('uploadedBy', 'name');
        ok(res, await dto(saved, req.actor!.id), 'Combined PDF ready.');
      } catch {
        if (uploaded) await storage.remove(uploaded).catch(() => {});
        await Note.updateOne(
          { _id: note.id, pdfGenerationAttemptId: attemptId },
          {
            $set: { pdfGenerationAttemptId: null, pdfGenerationExpiresAt: null },
            $push: {
              processingEvents: {
                step: 'pdf',
                status: 'failed',
                at: new Date(),
                message: 'Combined PDF could not be generated. Original pages remain available.',
              },
            },
          },
        );
        throw new HttpError(
          502,
          'PDF_FAILED',
          'Could not generate a valid combined PDF. Please retry.',
        );
      }
    }),
  );
  router.get(
    '/notes/:id/generated-pdf',
    optionalAuth,
    wrap(async (req, res) => {
      const note = await getNote(req.params.id);
      assertReadable(note, req.actor);
      if (!note.generatedPdf)
        throw new HttpError(404, 'PDF_UNAVAILABLE', 'No combined PDF is available.');
      let bytes: Buffer;
      try {
        bytes = await storage.read(
          note.generatedPdf as StoredFile,
          'application/pdf',
          35 * 1024 * 1024,
        );
        if (!validPdfMarkers(bytes)) throw new Error('INVALID_PDF');
      } catch {
        throw new HttpError(502, 'PDF_UNAVAILABLE', 'The combined PDF could not be retrieved.');
      }
      res
        .status(200)
        .set({
          'Content-Type': 'application/pdf',
          'Content-Length': String(bytes.length),
          'Content-Disposition': `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="campusnotes.pdf"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        })
        .send(bytes);
    }),
  );
  router.post(
    '/notes/:id/generate-summary',
    requireAuth,
    wrap(async (req, res) => {
      if (!aiAvailable())
        throw new HttpError(503, 'AI_NOT_CONFIGURED', 'AI summary is unavailable.');
      const note = await ownedNote(req.params.id, req.actor!.id);
      if (
        note.publicationStatus !== 'draft' ||
        !note.assets?.length ||
        note.studyGateStatus !== 'approved' ||
        note.assets.some((asset) => asset.extractionStatus !== 'completed')
      )
        throw new HttpError(409, 'SUMMARY_UNAVAILABLE', 'Finish academic screening first.');
      if (note.aiStudySummary) {
        await note.populate('uploadedBy', 'name');
        return ok(res, await dto(note, req.actor!.id), 'Summary already ready.');
      }
      const attemptId = randomUUID();
      const claimed = await Note.findOneAndUpdate(
        {
          _id: note.id,
          uploadedBy: req.actor!.id,
          aiStudySummary: '',
          $or: [{ summaryAttemptId: null }, { summaryExpiresAt: { $lte: new Date() } }],
        },
        { $set: { summaryAttemptId: attemptId, summaryExpiresAt: new Date(Date.now() + 60_000) } },
        { new: true },
      );
      if (!claimed)
        throw new HttpError(409, 'SUMMARY_IN_PROGRESS', 'Summary generation is already running.');
      try {
        const bullets = await suggestSummary(
          claimed.assets!.map((asset) => ({
            id: asset.id,
            extractedText: asset.extractedText ?? null,
          })),
        );
        const text = bullets.map((bullet) => `• ${bullet.text}`).join('\n');
        const saved = await Note.findOneAndUpdate(
          {
            _id: note.id,
            summaryAttemptId: attemptId,
            studyGateInputVersion: claimed.studyGateInputVersion,
          },
          {
            $set: {
              aiStudySummary: text,
              summarySources: bullets,
              ...(claimed.studySummary ? {} : { studySummary: text }),
              summaryAttemptId: null,
              summaryExpiresAt: null,
            },
            $push: {
              processingEvents: {
                step: 'summary',
                status: 'completed',
                at: new Date(),
                message: 'Grounded study summary is ready for student review.',
              },
            },
          },
          { new: true },
        );
        if (!saved) throw new Error('STALE_SUMMARY_ATTEMPT');
        await saved.populate('uploadedBy', 'name');
        ok(res, await dto(saved, req.actor!.id), 'Study summary ready.');
      } catch {
        await Note.updateOne(
          { _id: note.id, summaryAttemptId: attemptId },
          {
            $set: { summaryAttemptId: null, summaryExpiresAt: null },
            $push: {
              processingEvents: {
                step: 'summary',
                status: 'failed',
                at: new Date(),
                message: 'Unable to generate a reliable summary from the available content.',
              },
            },
          },
        );
        throw new HttpError(
          422,
          'SUMMARY_UNAVAILABLE',
          'Unable to generate a reliable summary from the available content.',
        );
      }
    }),
  );
  router.post(
    '/notes/:id/publish',
    requireAuth,
    wrap(async (req, res) => {
      const confirmation = z
        .object({
          publishConfirmed: z.literal(true),
          sharingRightsConfirmed: z.literal(true),
          personalInfoChecked: z.literal(true),
          acknowledgeNoPdf: z.boolean().optional(),
        })
        .parse(req.body);
      const note = await ownedNote(req.params.id, req.actor!.id);
      if (note.publicationStatus === 'published') {
        await note.populate('uploadedBy', 'name');
        return ok(res, await dto(note, req.actor!.id), 'Note already published.');
      }
      if (note.studyGateStatus !== 'approved' || note.processingStatus !== 'completed')
        throw new HttpError(
          409,
          'NOT_READY',
          'Academic screening and processing must finish before publication.',
        );
      if (note.title.trim().length < 3 || note.subject.trim().length < 2)
        throw new HttpError(400, 'METADATA_REQUIRED', 'Add a title and subject before publishing.');
      if (!note.assets?.length)
        throw new HttpError(
          409,
          'LEGACY_NOTE',
          'This note already follows the legacy publication policy.',
        );
      const assetCount = note.assets.length;
      const positions = note.assets.map((asset) => asset.confirmedPosition);
      if (
        positions.some((position) => position === null) ||
        new Set(positions).size !== assetCount ||
        positions.some((position) => position! < 0 || position! >= assetCount)
      )
        throw new HttpError(
          409,
          'ORDER_REQUIRED',
          'Confirm the final page order before publishing.',
        );
      if (note.assets.length > 1 && !note.generatedPdf && !confirmation.acknowledgeNoPdf)
        throw new HttpError(409, 'PDF_ACK_REQUIRED', 'Confirm publication without a combined PDF.');
      for (const asset of note.assets!) {
        try {
          const bytes = await storage.read(
            {
              storageProvider: 'cloudinary',
              storagePublicId: asset.storagePublicId,
              storageResourceType: asset.storageResourceType,
            },
            asset.mimeType,
          );
          const detected = await fileTypeFromBuffer(bytes);
          if (detected?.mime !== asset.mimeType) throw new Error('Invalid original');
        } catch {
          throw new HttpError(
            502,
            'FILE_UNAVAILABLE',
            'An original file is unavailable. Please retry.',
          );
        }
      }
      const published = await Note.findOneAndUpdate(
        {
          _id: note.id,
          uploadedBy: req.actor!.id,
          publicationStatus: 'draft',
          studyGateStatus: 'approved',
          processingStatus: 'completed',
          studyGateInputVersion: note.studyGateInputVersion,
        },
        {
          $set: { publicationStatus: 'published', publishedAt: new Date() },
          $push: {
            processingEvents: {
              step: 'publication',
              status: 'completed',
              at: new Date(),
              message: 'Student confirmed publication.',
            },
          },
        },
        { new: true },
      );
      if (!published)
        throw new HttpError(409, 'STALE_REVIEW', 'Refresh this note before publishing.');
      await published.populate('uploadedBy', 'name');
      ok(res, await dto(published, req.actor!.id), 'Note published.');
    }),
  );
  router.get(
    '/notes/:id/matching-requests',
    requireAuth,
    wrap(async (req, res) => {
      const note = await ownedNote(req.params.id, req.actor!.id);
      assertPublic(note);
      const requests = await NoteRequest.find({ status: 'open', createdBy: { $ne: req.actor!.id } })
        .sort({ createdAt: -1 })
        .limit(100);
      const words = (value: string) =>
        new Set(
          value
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter((word) => word.length >= 3),
        );
      const noteWords = words(`${note.title} ${note.subject} ${note.tags.join(' ')}`);
      const matches = requests
        .map((item) => {
          const shared = [...words(`${item.title} ${item.subject}`)].filter((word) =>
            noteWords.has(word),
          );
          const subjectMatch =
            note.subject.trim().toLowerCase() === item.subject.trim().toLowerCase();
          const score = shared.length + (subjectMatch ? 3 : 0);
          return {
            id: String(item.id),
            title: item.title,
            subject: item.subject,
            reason: subjectMatch
              ? `Same subject: ${item.subject}`
              : shared.length
                ? `Shared topic: ${shared.slice(0, 3).join(', ')}`
                : '',
            score,
          };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      ok(
        res,
        matches.map(({ score: _score, ...item }) => item),
      );
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
            studyAssessment: null,
            studyGateReviewedAt: new Date(),
            reviewRequestedAt: null,
            reviewMessage: reason,
            reviewedBy: req.actor!.id,
            studyGateAttemptId: null,
            ...(note.assets?.length && decision === 'approved'
              ? {
                  processingStatus: 'completed',
                  processingStage: 'ready_for_review',
                }
              : {}),
          },
          $push: {
            processingEvents: {
              step: 'moderator_review',
              status: 'completed',
              at: new Date(),
              message: `Moderator ${decision === 'approved' ? 'approved' : 'rejected'} the document: ${reason}`,
            },
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
