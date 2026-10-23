import type { StudyGateResult } from '@campusnotes/shared';
import { api, ApiError } from './api';

export class StudyGateApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'StudyGateApiError';
  }
}

async function request(
  noteId: string,
  method: 'GET' | 'POST',
  signal?: AbortSignal,
): Promise<StudyGateResult> {
  if (!/^[a-f\d]{24}$/i.test(noteId)) {
    throw new StudyGateApiError('INVALID_NOTE', 'Choose a valid uploaded document.', false);
  }
  try {
    return await api<StudyGateResult>(
      `/notes/${noteId}/${method === 'POST' ? 'ai-process' : 'ai-status'}`,
      { method, signal },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (error instanceof ApiError) {
      const message =
        error.status === 401
          ? 'Sign in to check your document.'
          : error.status === 403 || error.status === 404
            ? 'This document is unavailable to your account.'
            : error.code === 'AI_BUSY'
              ? 'Another analysis is still running. Wait for it to finish, then refresh the document status.'
              : error.code === 'RATE_LIMITED'
                ? 'Too many requests were sent recently. Wait a few minutes before retrying.'
                : error.status === 409
                  ? 'An analysis is already running. Check its status shortly.'
                  : error.status === 501 || error.code === 'AI_NOT_CONFIGURED'
                    ? 'Document analysis is not available yet. Your upload is retained.'
                    : 'The analysis could not finish. Your upload is retained. Please retry later.';
      throw new StudyGateApiError(
        error.code,
        message,
        error.status === 0 ||
          error.status === 409 ||
          error.status === 429 ||
          (error.status >= 500 && error.status !== 501),
      );
    }
    throw new StudyGateApiError(
      'UNKNOWN_ERROR',
      'The analysis could not finish. Please retry later.',
      true,
    );
  }
}

export const processStudyNote = (noteId: string, signal?: AbortSignal) =>
  request(noteId, 'POST', signal);
export const getStudyGateStatus = (noteId: string, signal?: AbortSignal) =>
  request(noteId, 'GET', signal);
