import { HttpError } from '../../utils/http.js';

export const publicNoteQuery = { studyGateStatus: 'approved' } as const;
export function canReadNote(note: any, actor?: { id: string; role?: string }): boolean {
  return (
    note.studyGateStatus === 'approved' ||
    !!(
      actor &&
      (String(note.uploadedBy?._id ?? note.uploadedBy) === actor.id ||
        (actor.role === 'moderator' && note.reviewRequestedAt))
    )
  );
}
export function assertReadable(note: any, actor?: { id: string; role?: string }) {
  if (!canReadNote(note, actor)) throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
}
export function assertPublic(note: any) {
  if (!note || note.studyGateStatus !== 'approved')
    throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
}
