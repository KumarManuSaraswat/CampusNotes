import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Download,
  Flag,
  FileText,
  UserRound,
  CalendarDays,
  Trash2,
} from 'lucide-react';
import type { NoteDto } from '@campusnotes/shared';
import { API_BASE, api, json } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { StudyGateControls } from '../components/ai/StudyGateControls';
const reasons = [
  ['spam', 'Spam'],
  ['misleading_metadata', 'Misleading metadata'],
  ['duplicate', 'Duplicate upload'],
  ['inappropriate', 'Inappropriate content'],
  ['unauthorized_material', 'Unauthorized or plagiarized material'],
];
export function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState<NoteDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason] = useState('spam');
  const [description, setDescription] = useState('');
  const [matches, setMatches] = useState<
    Array<{ id: string; title: string; subject: string; reason: string }>
  >([]);
  const [requestMatch, setRequestMatch] = useState<string | null>(null);
  const { user } = useAuth();
  const toast = useToast();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setNote(null);
    api<NoteDto>('/notes/' + id)
      .then((value) => {
        if (active) setNote(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, user?.id]);
  useEffect(() => {
    if (!note || !user || user.id !== note.uploadedBy.id || note.publicationStatus === 'draft')
      return;
    api<Array<{ id: string; title: string; subject: string; reason: string }>>(
      `/notes/${note.id}/matching-requests`,
    )
      .then(setMatches)
      .catch(() => setMatches([]));
  }, [note?.id, note?.publicationStatus, user?.id]);
  async function fulfillMatch(requestId: string) {
    if (!note || requestMatch !== requestId) return;
    setBusy(true);
    try {
      await api(`/requests/${requestId}/fulfill`, json('PATCH', { noteId: note.id }));
      setMatches((current) => current.filter((item) => item.id !== requestId));
      setRequestMatch(null);
      toast('Request fulfilled with this note.');
    } catch (failure) {
      toast((failure as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function downloadOriginal() {
    if (!note) return;
    setDownloading(true);
    try {
      const response = await fetch(API_BASE + note.downloadUrl, { credentials: 'include' });
      const mime = response.headers.get('content-type')?.split(';')[0].trim();
      if (!response.ok || mime !== note.fileType)
        throw new Error('The original file is unavailable. Please try again later.');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = note.originalFilename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      toast((e as Error).message || 'Download failed. Please try again.', 'error');
    } finally {
      setDownloading(false);
    }
  }
  async function vote(value: -1 | 1) {
    if (!user) {
      toast('Log in to vote.', 'error');
      return;
    }
    if (!note) return;
    setBusy(true);
    try {
      const state = await api<Pick<NoteDto, 'upvoteCount' | 'downvoteCount' | 'score' | 'myVote'>>(
        '/notes/' + id + '/vote',
        note.myVote === value ? { method: 'DELETE' } : json('POST', { value }),
      );
      setNote({ ...note, ...state });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function report() {
    setBusy(true);
    try {
      await api('/notes/' + id + '/report', json('POST', { reason, description }));
      toast('Report submitted. Thank you.');
      setShowReport(false);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function deleteNote() {
    if (!note || !window.confirm(`Delete "${note.title}" permanently?`)) return;
    setBusy(true);
    try {
      await api('/notes/' + note.id, { method: 'DELETE' });
      toast('Note deleted.');
      navigate('/my-notes');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <div className="container page loading">Loading note…</div>;
  if (error || !note)
    return (
      <div className="container page empty">
        <h2>Note unavailable</h2>
        <p>{error}</p>
        <Link to="/discover">Back to discovery</Link>
      </div>
    );
  return (
    <div className="container page">
      <Link className="back-link" to="/discover">
        <ArrowLeft size={17} /> Back to notes
      </Link>
      <div className="detail-grid">
        <div>
          {user?.id === note.uploadedBy.id && !note.assets?.length && (
            <StudyGateControls note={note} onChange={setNote} />
          )}
          {user?.id === note.uploadedBy.id &&
            !!note.assets?.length &&
            note.publicationStatus === 'draft' && (
              <div className="soft-banner">
                <strong>This note is private.</strong>{' '}
                <Link to={`/notes/${note.id}/review`}>Review and publish →</Link>
              </div>
            )}
          <div className="detail-heading">
            <span className="pill">{note.subject || 'Uncategorized'}</span>
            {note.aiPageOrder &&
              note.orderConfirmedAt &&
              !!note.assets?.length &&
              note.assets.every(
                (asset) =>
                  asset.confirmedPosition === note.aiPageOrder!.orderedAssetIds.indexOf(asset.id),
              ) && <span className="pill">AI order reviewed by uploader</span>}
            <h1>{note.title}</h1>
            <p>{note.description || 'No description added yet.'}</p>
            <div className="byline">
              <UserRound size={16} /> Shared by {note.uploadedBy.name} <span>•</span>{' '}
              {new Date(note.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div className="surface preview-panel">
            <div className="preview-head">
              <span>
                <FileText size={19} /> Original{' '}
                {note.assets?.length && note.assets.length > 1 ? 'pages' : 'document'}
              </span>
              <button className="button small" disabled={downloading} onClick={downloadOriginal}>
                <Download size={16} />{' '}
                {downloading
                  ? 'Preparing…'
                  : note.assets?.length && note.assets.length > 1
                    ? 'Download first page'
                    : 'Download'}
              </button>
            </div>
            {note.assets && note.assets.length > 1 ? (
              note.assets
                .slice()
                .sort(
                  (a, b) =>
                    (a.confirmedPosition ?? a.uploadIndex) - (b.confirmedPosition ?? b.uploadIndex),
                )
                .map((asset, index) => (
                  <div key={asset.id} className="detail-asset">
                    <h3>
                      Page {index + 1}: {asset.originalFilename}
                    </h3>
                    <OriginalPreview
                      note={{
                        ...note,
                        id: note.id + asset.id,
                        fileType: asset.mimeType,
                        previewUrl: asset.previewUrl,
                        downloadUrl: asset.downloadUrl,
                      }}
                    />
                    <a href={API_BASE + asset.downloadUrl}>Download this page</a>
                  </div>
                ))
            ) : (
              <OriginalPreview note={note} />
            )}
          </div>
          {note.studySummary && (
            <div className="surface preview-panel">
              <h2>Study summary</h2>
              <p>{note.studySummary}</p>
            </div>
          )}
          {note.generatedPdfUrl && (
            <div className="surface preview-panel">
              <h2>Combined PDF</h2>
              <a href={API_BASE + note.generatedPdfUrl}>Download organized PDF</a>
            </div>
          )}
        </div>
        <aside>
          <div className="surface side-panel">
            <h2>About these notes</h2>
            <dl>
              <dt>Subject</dt>
              <dd>{note.subject || 'Not specified'}</dd>
              <dt>Topics</dt>
              <dd>{note.tags.length ? note.tags.join(', ') : 'Not specified'}</dd>
              <dt>Instructor</dt>
              <dd>{note.instructor || 'Not specified'}</dd>
              <dt>Lecture date</dt>
              <dd>
                {note.lectureDate ? (
                  <>
                    <CalendarDays size={15} /> {note.lectureDate}
                  </>
                ) : (
                  'Not specified'
                )}
              </dd>
              <dt>Semester</dt>
              <dd>{note.semester || 'Not specified'}</dd>
              <dt>Metadata</dt>
              <dd>
                {note.metadataSource === 'filename'
                  ? 'Title from filename'
                  : note.metadataSource === 'manual'
                    ? 'Entered by student'
                    : 'AI suggestion reviewed by student'}
              </dd>
            </dl>
          </div>
          <div className="surface side-panel">
            <h2>Helpful notes?</h2>
            <div className="vote-row">
              <button
                aria-label="Upvote"
                aria-pressed={note.myVote === 1}
                className={note.myVote === 1 ? 'selected' : ''}
                disabled={
                  busy || user?.id === note.uploadedBy.id || note.studyGateStatus !== 'approved'
                }
                onClick={() => vote(1)}
              >
                <ArrowUp size={20} />
              </button>
              <strong>{note.score}</strong>
              <button
                aria-label="Downvote"
                aria-pressed={note.myVote === -1}
                className={note.myVote === -1 ? 'selected' : ''}
                disabled={
                  busy || user?.id === note.uploadedBy.id || note.studyGateStatus !== 'approved'
                }
                onClick={() => vote(-1)}
              >
                <ArrowDown size={20} />
              </button>
            </div>
            <small>
              {note.upvoteCount} upvotes · {note.downvoteCount} downvotes
            </small>
            {user?.id === note.uploadedBy.id && (
              <p className="hint">You cannot vote on your own notes.</p>
            )}
          </div>
          {user?.id === note.uploadedBy.id && matches.length > 0 && (
            <div className="surface side-panel">
              <h2>Matching open requests</h2>
              {matches.map((match) => (
                <div key={match.id} className="request-match">
                  <strong>{match.title}</strong>
                  <p>{match.reason}</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={requestMatch === match.id}
                      onChange={(event) => setRequestMatch(event.target.checked ? match.id : null)}
                    />{' '}
                    This note matches the request
                  </label>
                  <button
                    className="button small"
                    disabled={busy || requestMatch !== match.id}
                    onClick={() => void fulfillMatch(match.id)}
                  >
                    Fulfill request
                  </button>
                </div>
              ))}
            </div>
          )}
          {user?.id === note.uploadedBy.id && (
            <div className="surface side-panel">
              <h2>Manage this note</h2>
              <p>Remove this upload if it’s incorrect or no longer needed.</p>
              <button className="delete-note-button" disabled={busy} onClick={deleteNote}>
                <Trash2 size={16} /> Delete note
              </button>
            </div>
          )}
          <div className="surface side-panel">
            <button
              className="link-button report-link"
              disabled={note.studyGateStatus !== 'approved'}
              onClick={() =>
                user ? setShowReport(!showReport) : toast('Log in to report a note.', 'error')
              }
            >
              <Flag size={17} /> Report this note
            </button>
            {showReport && (
              <div className="report-form">
                <label className="field">
                  Reason
                  <select value={reason} onChange={(e) => setReason(e.target.value)}>
                    {reasons.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Details (optional)
                  <textarea
                    rows={3}
                    value={description}
                    maxLength={1000}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <button className="button small" disabled={busy} onClick={report}>
                  Submit report
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function OriginalPreview({ note }: { note: NoteDto }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setStatus('loading');
    setUrl('');
    fetch(API_BASE + note.previewUrl, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        const mime = response.headers.get('content-type')?.split(';')[0].trim();
        if (!response.ok || mime !== note.fileType)
          throw new Error(
            'Preview could not be loaded. The original may be temporarily unavailable.',
          );
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setStatus('ready');
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setStatus('error');
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [note.id, note.previewUrl, note.fileType, attempt]);

  if (status === 'loading')
    return (
      <div className="preview-state" role="status">
        <div className="preview-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <span className="sr-only">Loading original preview…</span>
      </div>
    );
  if (status === 'error')
    return (
      <div className="preview-state error" role="alert">
        <div>
          <p>Preview unavailable. The original may be temporarily unavailable.</p>
          <button className="button small" onClick={() => setAttempt((value) => value + 1)}>
            Retry preview
          </button>
        </div>
      </div>
    );
  return note.fileType === 'application/pdf' ? (
    <>
      <iframe title="Document preview" src={url} className="document-preview" />
      <p className="preview-open">
        <a href={url} target="_blank" rel="noreferrer">
          Open PDF in a new tab
        </a>
      </p>
    </>
  ) : (
    <a
      className="image-open"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Open image at full size"
    >
      <img className="image-preview" src={url} alt={`Preview of ${note.title}`} />
    </a>
  );
}
