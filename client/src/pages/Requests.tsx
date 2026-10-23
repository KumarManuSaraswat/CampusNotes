import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareText, Plus, CheckCircle2 } from 'lucide-react';
import type { NoteDto } from '@campusnotes/shared';
import type { NoteRequest } from '../types';
import { api, json } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
export function Requests() {
  const [items, setItems] = useState<NoteRequest[]>([]);
  const [status, setStatus] = useState<'open' | 'fulfilled'>('open');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [instructor, setInstructor] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [myNotes, setMyNotes] = useState<NoteDto[]>([]);
  const [fulfillId, setFulfillId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState('');
  const [matchConfirmed, setMatchConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const toast = useToast();
  async function load() {
    setLoading(true);
    try {
      setItems(await api<NoteRequest[]>('/requests?status=' + status));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [status]);
  useEffect(() => {
    if (user)
      api<NoteDto[]>('/users/me/notes')
        .then((notes) =>
          setMyNotes(
            notes.filter(
              (n) => n.studyGateStatus === 'approved' && n.publicationStatus !== 'draft',
            ),
          ),
        )
        .catch(() => {});
  }, [user?.id]);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        '/requests',
        json('POST', { title, subject, instructor, lectureDate: date || null, description }),
      );
      toast('Request posted.');
      setShowForm(false);
      setTitle('');
      setSubject('');
      setInstructor('');
      setDate('');
      setDescription('');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function fulfill(e: FormEvent) {
    e.preventDefault();
    if (!selectedNote || !fulfillId || !matchConfirmed) return;
    setBusy(true);
    try {
      await api('/requests/' + fulfillId + '/fulfill', json('PATCH', { noteId: selectedNote }));
      toast('Request fulfilled.');
      setFulfillId(null);
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <div className="page-heading inline-heading">
        <div>
          <span className="eyebrow">Help each other out</span>
          <h1>Note requests</h1>
          <p>Missing a lecture? Ask the community. Have the notes? Share them.</p>
        </div>
        {user && (
          <button className="button" onClick={() => setShowForm(!showForm)}>
            <Plus size={18} /> New request
          </button>
        )}
      </div>
      {!user && (
        <div className="soft-banner">
          <Link to="/login">Log in</Link> to request notes or fulfill a classmate's request.
        </div>
      )}
      {showForm && (
        <form className="surface request-form" onSubmit={create}>
          <h2>What notes do you need?</h2>
          <div className="fields-grid">
            <label className="field">
              Title or topic
              <input
                required
                minLength={3}
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Thermodynamics lecture 5"
              />
            </label>
            <label className="field">
              Subject
              <input
                required
                minLength={2}
                maxLength={100}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label className="field">
              Instructor (optional)
              <input
                value={instructor}
                maxLength={100}
                onChange={(e) => setInstructor(e.target.value)}
              />
            </label>
            <label className="field">
              Lecture date (optional)
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field full">
              Details (optional)
              <textarea
                rows={3}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button className="button small" disabled={busy}>
              Post request
            </button>
          </div>
        </form>
      )}
      <div className="tabs">
        <button className={status === 'open' ? 'active' : ''} onClick={() => setStatus('open')}>
          Open requests
        </button>
        <button
          className={status === 'fulfilled' ? 'active' : ''}
          onClick={() => setStatus('fulfilled')}
        >
          Fulfilled
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <div className="loading">Loading requests…</div>
      ) : items.length ? (
        <div className="request-list">
          {items.map((item) => (
            <article className="surface request-item" key={item.id}>
              <div className="request-main">
                <div className="request-icon">
                  {item.status === 'open' ? (
                    <MessageSquareText size={22} />
                  ) : (
                    <CheckCircle2 size={22} />
                  )}
                </div>
                <div>
                  <div className="request-title-row">
                    <h2>{item.title}</h2>
                    <span className={'status ' + item.status}>{item.status}</span>
                  </div>
                  <p>{item.description || 'No extra details provided.'}</p>
                  <div className="request-meta">
                    <span>{item.subject}</span>
                    {item.instructor && <span>{item.instructor}</span>}
                    {item.lectureDate && <span>{item.lectureDate}</span>}
                    <span>Asked by {item.createdBy.name}</span>
                  </div>
                  {item.fulfilledNote && (
                    <Link className="text-link" to={'/notes/' + item.fulfilledNote.id}>
                      View shared notes →
                    </Link>
                  )}
                </div>
              </div>
              {item.status === 'open' && user && user.id !== item.createdBy.id && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setFulfillId(item.id);
                    setSelectedNote('');
                    setMatchConfirmed(false);
                  }}
                >
                  Fulfill with my note
                </button>
              )}
              {fulfillId === item.id && (
                <form className="fulfill-form" onSubmit={fulfill}>
                  <label className="field">
                    Choose one of your approved notes
                    <select
                      required
                      value={selectedNote}
                      onChange={(e) => setSelectedNote(e.target.value)}
                    >
                      <option value="">Select a note</option>
                      {myNotes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!myNotes.length && (
                    <p className="hint">Upload notes first, then return to fulfill this request.</p>
                  )}
                  <label className="field">
                    <input
                      type="checkbox"
                      checked={matchConfirmed}
                      onChange={(event) => setMatchConfirmed(event.target.checked)}
                    />{' '}
                    I confirm this note matches the request.
                  </label>
                  <div className="form-actions">
                    <Link
                      className="secondary-button"
                      to={`/upload?requestId=${encodeURIComponent(item.id)}`}
                    >
                      Upload a new note
                    </Link>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setFulfillId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="button small"
                      disabled={busy || !selectedNote || !matchConfirmed}
                    >
                      Fulfill request
                    </button>
                  </div>
                </form>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <MessageSquareText size={28} />
          <h3>{status === 'open' ? 'No open requests' : 'No fulfilled requests yet'}</h3>
          <p>
            {status === 'open'
              ? 'The community is all caught up for now.'
              : 'Fulfilled requests will appear here.'}
          </p>
        </div>
      )}
    </div>
  );
}
