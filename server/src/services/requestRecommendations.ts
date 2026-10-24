import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { RequestRecommendationsResult } from '@campusnotes/shared';
import { Note } from '../models/Note.js';
import { NoteRequest } from '../models/NoteRequest.js';
import { HttpError } from '../utils/http.js';
import { publicNoteQuery } from './ai/noteVisibility.js';
import { recommendationConfiguration, recommendRequestNotes } from './ai/recommendRequestNotes.js';

const activeActors = new Set<string>();
const metadataFields = 'title subject description tags instructor lectureDate';
async function ownedRequest(requestId: string, actorId: string) {
  if (!mongoose.isValidObjectId(requestId))
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request identifier.');
  const request = await NoteRequest.findById(requestId);
  if (!request) throw new HttpError(404, 'NOT_FOUND', 'Request not found.');
  if (String(request.createdBy) !== actorId)
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Only the student who posted this request can manage suggestions.',
    );
  return request;
}

async function recommendationDto(
  request: NonNullable<Awaited<ReturnType<typeof ownedRequest>>>,
): Promise<RequestRecommendationsResult> {
  const notes = await Note.find({
    ...publicNoteQuery,
    _id: { $in: request.recommendations.map((item) => item.noteId) },
    uploadedBy: { $ne: request.createdBy },
  })
    .select(metadataFields)
    .lean();
  return {
    requestId: String(request.id),
    checkedAt: request.recommendationsCheckedAt!.toISOString(),
    recommendations: request.recommendations.flatMap((item) => {
      const note = notes.find((n) => String(n._id) === String(item.noteId));
      return note
        ? [
            {
              noteId: String(note._id),
              title: note.title,
              subject: note.subject,
              description: note.description.slice(0, 240),
              reason: item.reason!,
              evidence: item.evidence!,
            },
          ]
        : [];
    }),
  };
}

export async function findRequestRecommendations(requestId: string, actorId: string) {
  const request = await ownedRequest(requestId, actorId);
  if (request.status !== 'open')
    throw new HttpError(409, 'REQUEST_UNAVAILABLE', 'This request is already fulfilled.');
  if (
    request.recommendationsCheckedAt &&
    Date.now() - request.recommendationsCheckedAt.getTime() < 300_000
  )
    return recommendationDto(request);
  recommendationConfiguration();
  if (activeActors.has(actorId) || activeActors.size >= 2)
    throw new HttpError(
      429,
      'RECOMMENDATIONS_BUSY',
      'Another suggestions check is running. Please retry shortly.',
    );
  const attemptId = randomUUID();
  activeActors.add(actorId);
  try {
    const claimed = await NoteRequest.findOneAndUpdate(
      {
        _id: requestId,
        createdBy: actorId,
        status: 'open',
        $and: [
          {
            $or: [
              { recommendationAttemptId: null },
              { recommendationExpiresAt: { $lte: new Date() } },
            ],
          },
          {
            $or: [
              { recommendationAttemptAt: null },
              { recommendationAttemptAt: { $lte: new Date(Date.now() - 60_000) } },
            ],
          },
        ],
      },
      {
        $set: {
          recommendationAttemptId: attemptId,
          recommendationExpiresAt: new Date(Date.now() + 45_000),
          recommendationAttemptAt: new Date(),
        },
      },
    );
    if (!claimed)
      throw new HttpError(
        429,
        'RECOMMENDATIONS_BUSY',
        'Please wait a minute before checking suggestions again.',
      );
    // Tokenize query syntax instead of letting quoted/negative search operators alter retrieval.
    const terms = [
      ...new Set(
        `${request.title} ${request.subject} ${request.description}`
          .toLowerCase()
          .match(/[\p{L}\p{N}]{2,}/gu) || [],
      ),
    ]
      .slice(0, 24)
      .join(' ');
    const visibility = { ...publicNoteQuery, uploadedBy: { $ne: request.createdBy } };
    let notes = terms
      ? await Note.find({ ...visibility, $text: { $search: terms } })
          .select(metadataFields)
          .sort({ score: { $meta: 'textScore' } })
          .limit(24)
          .maxTimeMS(4000)
          .lean()
      : [];
    if (!notes.length)
      notes = await Note.find(visibility)
        .select(metadataFields)
        .sort({ createdAt: -1 })
        .limit(24)
        .maxTimeMS(4000)
        .lean();
    const matches = await recommendRequestNotes(
      {
        title: request.title,
        subject: request.subject,
        description: request.description,
        instructor: request.instructor,
        lectureDate: request.lectureDate?.toISOString().slice(0, 10) || null,
      },
      notes.map((note) => ({
        noteId: String(note._id),
        title: note.title,
        subject: note.subject,
        description: note.description.slice(0, 700),
        tags: note.tags.slice(0, 12),
        instructor: note.instructor,
        lectureDate: note.lectureDate?.toISOString().slice(0, 10) || null,
      })),
    );
    const saved = await NoteRequest.findOneAndUpdate(
      { _id: requestId, status: 'open', recommendationAttemptId: attemptId },
      {
        $set: {
          recommendations: matches,
          recommendationsCheckedAt: new Date(),
          recommendationAttemptId: null,
          recommendationExpiresAt: null,
        },
      },
      { new: true },
    );
    if (!saved)
      throw new HttpError(
        409,
        'REQUEST_UNAVAILABLE',
        'This request was updated while suggestions were being checked.',
      );
    return recommendationDto(saved);
  } finally {
    activeActors.delete(actorId);
    await NoteRequest.updateOne(
      { _id: requestId, recommendationAttemptId: attemptId },
      { $set: { recommendationAttemptId: null, recommendationExpiresAt: null } },
    );
  }
}

/** Only explicit requester acceptance can resolve a request using a recommendation. */
export async function acceptRequestRecommendation(
  requestId: string,
  actorId: string,
  noteId: string,
) {
  if (!mongoose.isValidObjectId(noteId))
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid note identifier.');
  await ownedRequest(requestId, actorId);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const request = await NoteRequest.findOne({ _id: requestId, createdBy: actorId }).session(
        session,
      );
      if (!request) throw new HttpError(404, 'NOT_FOUND', 'Request not found.');
      if (request.status === 'fulfilled') {
        if (
          String(request.acceptedRecommendationBy) === actorId &&
          String(request.fulfilledNote) === noteId
        )
          return;
        throw new HttpError(409, 'REQUEST_UNAVAILABLE', 'This request has already been fulfilled.');
      }
      if (!request.recommendations.some((item) => String(item.noteId) === noteId))
        throw new HttpError(
          400,
          'NOT_RECOMMENDED',
          'Choose one of the suggested notes for this request.',
        );
      // Lock the public note version during acceptance to conflict with concurrent removal/moderation.
      const note = await Note.findOneAndUpdate(
        { _id: noteId, ...publicNoteQuery, uploadedBy: { $ne: actorId } },
        { $inc: { __v: 1 } },
        { new: true, session },
      );
      if (!note)
        throw new HttpError(
          409,
          'NOTE_UNAVAILABLE',
          'This note is no longer public. Your request is still open.',
        );
      const saved = await NoteRequest.updateOne(
        { _id: requestId, createdBy: actorId, status: 'open' },
        {
          $set: {
            status: 'fulfilled',
            fulfilledNote: noteId,
            fulfilledBy: note.uploadedBy,
            fulfilledAt: new Date(),
            acceptedRecommendationBy: actorId,
            recommendationAttemptId: null,
            recommendationExpiresAt: null,
          },
        },
        { session },
      );
      if (!saved.modifiedCount)
        throw new HttpError(409, 'REQUEST_UNAVAILABLE', 'This request has already been fulfilled.');
    });
    return { id: requestId, status: 'fulfilled' as const, noteId };
  } finally {
    await session.endSession();
  }
}
