import { HttpError } from '../../utils/http.js';

// Existing approved single-file records have no assets field. Preserve their historic public
// access without making newly uploaded grouped drafts public before author confirmation.
export const publicNoteQuery = {
  studyGateStatus: 'approved',
  $or: [{ publicationStatus: 'published' }, { assets: { $exists: false } }],
};
export function isPublicNote(note: any): boolean {
  return (
    note?.studyGateStatus === 'approved' &&
    (note.publicationStatus === 'published' || !note.assets?.length)
  );
}
export function canReadNote(note: any, actor?: { id: string; role?: string }): boolean {
  return (
    isPublicNote(note) ||
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
  if (!isPublicNote(note)) throw new HttpError(404, 'NOT_FOUND', 'Note not found.');
}
