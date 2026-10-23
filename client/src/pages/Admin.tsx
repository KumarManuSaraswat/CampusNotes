import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import type { Report } from '../types';
import { api, json } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { StudyReviewQueue } from '../components/ai/StudyReviewQueue';
const labels: Record<string, string> = {
  spam: 'Spam',
  misleading_metadata: 'Misleading metadata',
  duplicate: 'Duplicate upload',
  inappropriate: 'Inappropriate content',
  unauthorized_material: 'Unauthorized or plagiarized material',
};
export function Admin() {
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const toast = useToast();
  async function load() {
    setLoading(true);
    try {
      setItems(await api<Report[]>('/admin/reports?status=' + status));
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
  async function update(id: string, next: 'reviewed' | 'resolved') {
    try {
      await api('/admin/reports/' + id, json('PATCH', { status: next }));
      toast('Report updated.');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">Community care</span>
        <h1>Moderation</h1>
        <p>Review reports and keep the note library useful.</p>
      </div>
      <StudyReviewQueue />
      <h2>Community reports</h2>
      <div className="tabs">
        {['open', 'reviewed', 'resolved', 'all'].map((s) => (
          <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <div className="loading">Loading reports…</div>
      ) : items.length ? (
        <div className="request-list">
          {items.map((r) => (
            <article className="surface report-item" key={r.id}>
              <div>
                <span className={'status ' + r.status}>{r.status}</span>
                <h2>{labels[r.reason] || r.reason}</h2>
                <p>{r.description || 'No additional explanation.'}</p>
                <small>
                  Reported by {r.reportedBy} on {new Date(r.createdAt).toLocaleDateString()}
                </small>
                <div>
                  {r.note ? (
                    <Link to={'/notes/' + r.note.id}>{r.note.title} →</Link>
                  ) : (
                    <span>Note deleted</span>
                  )}
                </div>
              </div>
              <div className="report-actions">
                {r.status === 'open' && (
                  <button className="secondary-button" onClick={() => update(r.id, 'reviewed')}>
                    Mark reviewed
                  </button>
                )}
                {r.status !== 'resolved' && (
                  <button className="button small" onClick={() => update(r.id, 'resolved')}>
                    Resolve
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <ShieldCheck size={28} />
          <h3>No reports here</h3>
          <p>Reports with this status will appear here.</p>
        </div>
      )}
    </div>
  );
}
