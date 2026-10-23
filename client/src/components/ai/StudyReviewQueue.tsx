import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NoteDto } from '@campusnotes/shared';
import { api, json } from '../../services/api';
export function StudyReviewQueue() {
  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  useEffect(() => {
    api<NoteDto[]>('/admin/study-reviews')
      .then(setNotes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function review(noteId: string, decision: 'approved' | 'rejected') {
    setBusy(true);
    setError('');
    try {
      await api(
        '/admin/study-reviews/' + noteId,
        json('PATCH', { decision, reason: reasons[noteId] || '' }),
      );
      setNotes((current) => current.filter((n) => n.id !== noteId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="review-queue">
      <div className="section-heading">
        <div>
          <span className="eyebrow">HUMAN PERSPECTIVE</span>
          <h2>Study review requests</h2>
        </div>
        <span className="pill">{notes.length} waiting</span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading review requests…</p>
      ) : !notes.length ? (
        <p className="soft-banner">No documents are waiting for a human review.</p>
      ) : (
        notes.map((note) => (
          <article className="surface review-item" key={note.id}>
            <div className="section-heading">
              <div>
                <h3>{note.title}</h3>
                <p>Requested by {note.uploadedBy.name}</p>
              </div>
              <Link className="text-link" to={'/notes/' + note.id}>
                Inspect original ↗
              </Link>
            </div>
            <p>
              {note.studyAssessment?.reason ||
                'This document has not received a complete AI assessment.'}
            </p>
            <label className="field">
              Feedback for the uploader
              <textarea
                minLength={5}
                maxLength={320}
                value={reasons[note.id] || ''}
                onChange={(e) => setReasons({ ...reasons, [note.id]: e.target.value })}
                placeholder="Explain your decision after inspecting the original document."
              />
            </label>
            <div className="form-actions">
              <button
                disabled={busy || (reasons[note.id] || '').trim().length < 5}
                className="secondary-button"
                onClick={() => void review(note.id, 'rejected')}
              >
                Keep private
              </button>
              <button
                disabled={busy || (reasons[note.id] || '').trim().length < 5}
                className="button small"
                onClick={() => void review(note.id, 'approved')}
              >
                Approve for library
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
