import type { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { lectureDateSchema, metadataSchema } from '@campusnotes/shared';
import { Note } from '../models/Note.js';
import { Vote } from '../models/Vote.js';
import { Report } from '../models/Report.js';
import { NoteRequest } from '../models/NoteRequest.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
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

      const response = await Promise.all(
        createdNotes.map((note) => dto(note, req.actor!.id)),
      );
      ok(res, response, 'Notes uploaded.', 201);
    }),
  );
  router.get(
    '/notes',
    wrap(async (req, res) => {
      const f = filterSchema.parse(req.query);
      const query: any = {};
      if (f.q) query.$text = { $search: f.q };
      if (f.subject) query.subject = new RegExp(escaped(f.subject), 'i');
      if (f.tag) query.tags = new RegExp(escaped(f.tag), 'i');
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
    wrap(async (req, res) => ok(res, await dto(await getNote(req.params.id), req.actor?.id))),
  );
  router.get(
    '/notes/:id/file',
    wrap(async (req, res) => {
      const note = await getNote(req.params.id);
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
  router.post('/notes/:id/ai-process', requireAuth, (_req, res) =>
    res.status(501).json({
      success: false,
      error: { code: 'AI_NOT_CONFIGURED', message: 'AI organization is not configured yet.' },
    }),
  );
}
