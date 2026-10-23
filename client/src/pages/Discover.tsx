import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, SlidersHorizontal, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import type { NoteDto } from '@campusnotes/shared';
import { api } from '../services/api';
import { NoteCard } from '../components/notes/NoteCard';
export function Discover() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(params.get('q') || '');
  const [result, setResult] = useState<{
    items: NoteDto[];
    total: number;
    page: number;
    pages: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<typeof result>('/notes?' + params.toString(), { signal: controller.signal })
      .then((d) => {
        setResult(d);
        setError('');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [params]);
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    update('q', draft.trim());
  }
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">Explore the library</span>
        <h1>Discover notes</h1>
        <p>Find exactly what you need from notes shared by your campus community.</p>
      </div>
      <form className="search-bar" onSubmit={submit}>
        <Search size={20} />
        <input
          aria-label="Search notes"
          placeholder="Search notes, subjects, or topics"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="button">Search</button>
      </form>
      <div className="filter-heading">
        <SlidersHorizontal size={18} />
        <strong>Refine results</strong>
      </div>
      <div className="filters">
        <label>
          Subject
          <input
            value={params.get('subject') || ''}
            onChange={(e) => update('subject', e.target.value)}
            placeholder="Any subject"
          />
        </label>
        <label>
          Topic
          <input
            value={params.get('tag') || ''}
            onChange={(e) => update('tag', e.target.value)}
            placeholder="Any topic"
          />
        </label>
        <label>
          Instructor
          <input
            value={params.get('instructor') || ''}
            onChange={(e) => update('instructor', e.target.value)}
            placeholder="Any instructor"
          />
        </label>
        <label>
          Lecture date
          <input
            type="date"
            value={params.get('date') || ''}
            onChange={(e) => update('date', e.target.value)}
          />
        </label>
        <label>
          Sort by
          <select
            value={params.get('sort') || 'recent'}
            onChange={(e) => update('sort', e.target.value)}
          >
            <option value="recent">Most recent</option>
            <option value="score">Highest score</option>
          </select>
        </label>
      </div>
      <div className="results-title">
        <h2>{loading ? 'Loading notes…' : `${result?.total || 0} notes found`}</h2>
        {params.toString() && (
          <button
            className="link-button"
            onClick={() => {
              setDraft('');
              setParams({});
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {error ? (
        <div className="form-error">{error}</div>
      ) : loading ? (
        <div className="loading">Loading notes…</div>
      ) : result?.items.length ? (
        <>
          <div className="cards-grid">
            {result.items.map((n) => (
              <NoteCard note={n} key={n.id} />
            ))}
          </div>
          <div className="pagination">
            <button
              disabled={result.page <= 1}
              onClick={() => update('page', String(result.page - 1))}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span>
              Page {result.page} of {result.pages}
            </span>
            <button
              disabled={result.page >= result.pages}
              onClick={() => update('page', String(result.page + 1))}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <div className="empty">
          <BookOpen size={28} />
          <h3>No notes found</h3>
          <p>Try different terms or share the notes you're looking for.</p>
          <Link className="button" to="/requests">
            Request notes
          </Link>
        </div>
      )}
    </div>
  );
}
