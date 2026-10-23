import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Trash2, Pencil } from 'lucide-react';
import type { NoteDto } from '@campusnotes/shared';
import { api, json } from '../services/api';
import { MetadataFields, type Metadata } from '../components/upload/MetadataFields';
import { useToast } from '../contexts/ToastContext';
import { StudyGateControls } from '../components/ai/StudyGateControls';
export function MyNotes() {
  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Metadata | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    api<NoteDto[]>('/users/me/notes')
      .then(setNotes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  function edit(note: NoteDto) {
    setEditing(note.id);
    setForm({
      title: note.title,
      subject: note.subject,
      tags: note.tags.join(', '),
      instructor: note.instructor,
      lectureDate: note.lectureDate || '',
      semester: note.semester,
      description: note.description,
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || !editing) return;
    setBusy(true);
    try {
      const note = await api<NoteDto>(
        '/notes/' + editing,
        json('PATCH', {
          ...form,
          tags: form.tags
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      );
      setNotes(notes.map((n) => (n.id === editing ? note : n)));
      setEditing(null);
      toast('Metadata updated.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function remove(note: NoteDto) {
    if (!window.confirm(`Delete "${note.title}" permanently?`)) return;
    try {
      await api('/notes/' + note.id, { method: 'DELETE' });
      setNotes(notes.filter((n) => n.id !== note.id));
      toast('Note deleted.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  return (
    <div className="container page">
      <div className="page-heading inline-heading">
        <div>
          <span className="eyebrow">Your contributions</span>
          <h1>My notes</h1>
          <p>Manage everything you've shared with the community.</p>
        </div>
        <Link className="button" to="/upload">
          <Plus size={18} /> Upload notes
        </Link>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="library-stats">
        <div>
          <span>Total uploads</span>
          <strong>{notes.length}</strong>
        </div>
        <div>
          <span>In the public library</span>
          <strong>
            {
              notes.filter(
                (n) => n.studyGateStatus === 'approved' && n.publicationStatus !== 'draft',
              ).length
            }
          </strong>
        </div>
        <div>
          <span>Private / need attention</span>
          <strong>
            {
              notes.filter(
                (n) => n.studyGateStatus !== 'approved' || n.publicationStatus === 'draft',
              ).length
            }
          </strong>
        </div>
      </div>
      <div className="tabs">
        {['all', 'approved', 'private'].map((value) => (
          <button
            key={value}
            className={filter === value ? 'active' : ''}
            onClick={() => setFilter(value)}
          >
            {value === 'all'
              ? 'All uploads'
              : value === 'approved'
                ? 'Published'
                : 'Private & review'}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading">Loading your notes…</div>
      ) : notes.length ? (
        <div className="my-notes-list">
          {filter !== 'all' &&
            !notes.some((n) =>
              filter === 'approved'
                ? n.studyGateStatus === 'approved' && n.publicationStatus !== 'draft'
                : n.studyGateStatus !== 'approved' || n.publicationStatus === 'draft',
            ) && (
              <div className="empty">
                <h3>No notes in this view</h3>
                <p>Choose All uploads to see the rest of your library.</p>
              </div>
            )}
          {notes
            .filter(
              (n) =>
                filter === 'all' ||
                (filter === 'approved'
                  ? n.studyGateStatus === 'approved' && n.publicationStatus !== 'draft'
                  : n.studyGateStatus !== 'approved' || n.publicationStatus === 'draft'),
            )
            .map((n) => (
              <div className="surface my-note" key={n.id}>
                <div className="my-note-main">
                  <div className="file-icon">
                    <BookOpen size={22} />
                  </div>
                  <div>
                    <Link to={'/notes/' + n.id}>
                      <h2>{n.title}</h2>
                    </Link>
                    <p>
                      {n.subject || 'Uncategorized'} · {new Date(n.createdAt).toLocaleDateString()}{' '}
                      ·{' '}
                      <span className={'gate-badge gate-' + n.studyGateStatus}>
                        {n.reviewRequestedAt
                          ? 'Review requested'
                          : n.studyGateStatus === 'approved' && n.publicationStatus !== 'draft'
                            ? 'Published'
                            : n.studyGateStatus === 'approved'
                              ? 'Ready for review'
                              : n.studyGateStatus.replaceAll('_', ' ')}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="my-note-actions">
                  {n.publicationStatus === 'draft' && !!n.assets?.length && (
                    <Link to={`/notes/${n.id}/review`}>Review & publish</Link>
                  )}
                  <button onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                    {expanded === n.id ? 'Hide status' : 'Study check'}
                  </button>
                  <button onClick={() => edit(n)}>
                    <Pencil size={16} /> Edit
                  </button>
                  <button className="danger-link" onClick={() => remove(n)}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
                {expanded === n.id && (
                  <div className="my-note-gate">
                    {n.assets?.length ? (
                      <Link to={`/notes/${n.id}/review`}>Continue processing and review →</Link>
                    ) : (
                      <StudyGateControls
                        note={n}
                        onChange={(updated) =>
                          setNotes((current) =>
                            current.map((item) => (item.id === updated.id ? updated : item)),
                          )
                        }
                      />
                    )}
                  </div>
                )}
                {editing === n.id && form && (
                  <form className="edit-form" onSubmit={save}>
                    <MetadataFields value={form} onChange={setForm} />
                    <div className="form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                      <button className="button small" disabled={busy}>
                        Save changes
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ))}
        </div>
      ) : (
        <div className="empty">
          <BookOpen size={28} />
          <h3>Your library starts here</h3>
          <p>Share your first set of notes to help classmates learn.</p>
          <Link className="button" to="/upload">
            Upload notes
          </Link>
        </div>
      )}
    </div>
  );
}
