import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { StudyGateResult } from '@campusnotes/shared';
import { Note } from '../../models/Note.js';
import { readEnv } from '../../config/env.js';
import { HttpError } from '../../utils/http.js';
import { storage } from '../storage/cloudinary.js';
import { prepareDocument, type DocumentMimeType } from './document/prepareDocument.js';
import { extractVisualText } from './vision/visionAnalyzer.js';
import { assessStudyContent, studyAssessmentSchema } from './classification/studyGate.js';
import { analysisFailure, type AnalysisStage } from './analysisFailure.js';

const activeActors = new Set<string>();
export function aiAvailable() {
  const env = readEnv();
  return env.AI_ENABLED === 'true' && !!env.GEMINI_API_KEY?.trim() && !!env.GEMINI_MODEL?.trim();
}
export function gateDto(note: any): StudyGateResult {
  return {
    noteId: String(note._id),
    processingStatus: note.processingStatus,
    studyGateStatus: note.studyGateStatus || 'legacy_unreviewed',
    assessment: note.studyAssessment ?? null,
    reviewRequestedAt: note.reviewRequestedAt?.toISOString() ?? null,
    reviewMessage: note.reviewMessage || '',
    processingError: note.studyGateStatus === 'failed' ? (note.processingError ?? null) : null,
  };
}
export async function ownedNote(noteId: string, actorId: string) {
  if (!mongoose.isValidObjectId(noteId))
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid note identifier.');
  const note = await Note.findById(noteId).select('+processingError');
  if (!note) throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
  if (String(note.uploadedBy) !== actorId)
    throw new HttpError(403, 'FORBIDDEN', 'Only the uploader can manage analysis.');
  return note;
}
export async function studyNoteStatus(noteId: string, actorId: string) {
  await ownedNote(noteId, actorId);
  await Note.updateOne(
    { _id: noteId, processingStatus: 'pending', studyGateExpiresAt: { $lte: new Date() } },
    {
      $set: {
        processingStatus: 'failed',
        studyGateStatus: 'failed',
        processingError: 'Analysis was interrupted. Please retry.',
        studyGateAttemptId: null,
      },
    },
  );
  return gateDto(await ownedNote(noteId, actorId));
}

/** Synchronous request lifecycle: every attempt is claimed, awaited and persisted before returning. */
export async function processStudyNote(noteId: string, actorId: string) {
  const original = await ownedNote(noteId, actorId);
  if (original.studyGateStatus === 'approved') return gateDto(original);
  if (!aiAvailable())
    throw new HttpError(
      503,
      'AI_NOT_CONFIGURED',
      'Analysis is unavailable. Your upload is private and retained. You can request a human review.',
    );
  if (activeActors.has(actorId) || activeActors.size >= readEnv().AI_MAX_CONCURRENT) {
    throw new HttpError(429, 'AI_BUSY', 'Analysis is busy. Please retry shortly.');
  }
  activeActors.add(actorId);
  const attemptId = randomUUID();
  try {
    const note = await Note.findOneAndUpdate(
      {
        _id: noteId,
        uploadedBy: actorId,
        studyGateStatus: { $ne: 'approved' },
        reviewRequestedAt: null,
        $or: [
          { processingStatus: { $ne: 'pending' } },
          { studyGateExpiresAt: { $lte: new Date() } },
        ],
      },
      {
        $set: {
          processingStatus: 'pending',
          studyGateStatus: 'pending',
          studyAssessment: null,
          processingError: null,
          studyGateAttemptId: attemptId,
          studyGateExpiresAt: new Date(Date.now() + 180_000),
          reviewMessage: '',
        },
        $inc: { studyGateInputVersion: 1 },
      },
      { new: true },
    );
    if (!note)
      throw new HttpError(
        409,
        'ANALYSIS_IN_PROGRESS',
        'This note is already being analysed or awaiting a human review.',
      );
    const attempt = {
      _id: noteId,
      studyGateAttemptId: attemptId,
      studyGateInputVersion: note.studyGateInputVersion,
      processingStatus: 'pending',
    };
    let stage: AnalysisStage = 'storage';
    try {
      const bytes = await storage.read(
        {
          storageProvider: 'cloudinary',
          storagePublicId: note.storagePublicId,
          storageResourceType: note.storageResourceType as 'raw' | 'image',
        },
        note.fileType,
      );
      const mimeType = note.fileType as DocumentMimeType;
      stage = 'document';
      const prepared = await prepareDocument({ bytes, mimeType }, { timeoutMs: 10_000 });
      stage = 'vision';
      const extracted =
        prepared.status === 'vision_required'
          ? await extractVisualText({ bytes, mimeType }, { timeoutMs: 15_000 })
          : { text: prepared.text, warnings: [] };
      // Reading warnings indicate incomplete evidence. Never classify that subset as the whole file.
      stage = 'classification';
      const assessment = studyAssessmentSchema.parse(
        extracted.warnings.length
          ? {
              decision: 'review',
              category: null,
              subject: null,
              tags: [],
              evidence: [],
              reason: 'Some content could not be read reliably. A human review is needed.',
              warnings: extracted.warnings.slice(0, 6).map((x) => x.slice(0, 240)),
            }
          : await assessStudyContent(
              { extractedText: extracted.text ?? '', originalFilename: note.originalFilename },
              { timeoutMs: 15_000 },
            ),
      );
      const gate = { academic: 'approved', non_academic: 'rejected', review: 'needs_review' }[
        assessment.decision
      ];
      const saved = await Note.findOneAndUpdate(
        attempt,
        {
          $set: {
            studyAssessment: assessment,
            studyGateStatus: gate,
            processingStatus: 'completed',
            studyGateReviewedAt: new Date(),
            lastProcessedAt: new Date(),
            studyGateAttemptId: null,
            studyGateExpiresAt: null,
            processingError: null,
          },
        },
        { new: true },
      );
      if (!saved)
        throw new HttpError(
          409,
          'STALE_ATTEMPT',
          'This analysis was superseded. Refresh the document status.',
        );
      return gateDto(saved);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const failure = analysisFailure(stage, error);
      // Never log provider messages, signed URLs, document content or credentials.
      console.warn('Study analysis failed', { attemptId, stage, code: failure.code });
      const saved = await Note.findOneAndUpdate(
        attempt,
        {
          $set: {
            processingStatus: 'failed',
            studyGateStatus: 'failed',
            studyAssessment: null,
            processingError: failure.message,
            studyGateAttemptId: null,
            studyGateExpiresAt: null,
            lastProcessedAt: new Date(),
          },
        },
        { new: true },
      ).select('+processingError');
      if (!saved)
        throw new HttpError(
          409,
          'STALE_ATTEMPT',
          'This analysis was superseded. Refresh the document status.',
        );
      return gateDto(saved);
    }
  } finally {
    activeActors.delete(actorId);
  }
}
