import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Search, UploadCloud, Users } from 'lucide-react';
import type { NoteDto } from '@campusnotes/shared';
import { api } from '../services/api';
import { NoteCard } from '../components/notes/NoteCard';
import { useAuth } from '../contexts/AuthContext';
export function Home() {
  const [items, setItems] = useState<NoteDto[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  useEffect(() => {
    api<{ items: NoteDto[] }>('/notes?limit=3')
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">A shared space for better learning</span>
            <h1>
              Every great lecture deserves <em>better notes.</em>
            </h1>
            <p>
              Find the notes you missed, share the ones you took, and make studying a little easier
              for everyone on campus.
            </p>
            <form
              className="hero-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate('/discover?q=' + encodeURIComponent(search));
              }}
            >
              <Search size={20} />
              <input
                aria-label="Search notes"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subjects, topics, or notes"
              />
              <button type="submit">
                Explore notes <ArrowRight size={16} />
              </button>
            </form>
            <div className="hero-links">
              <Link to={user ? '/upload' : '/register'}>
                <UploadCloud size={17} /> Share your notes
              </Link>
              <span>•</span>
              <Link to="/requests">
                <Users size={17} /> Help a classmate
              </Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-sheet sheet-back" />
            <div className="art-sheet sheet-front">
              <div className="art-sheet-icon">
                <BookOpen size={31} />
              </div>
              <div className="art-line long" />
              <div className="art-line" />
              <div className="art-line mid" />
              <div className="art-tags">
                <span>Share</span>
                <span>Discover</span>
                <span>Learn</span>
              </div>
            </div>
            <div className="floating-chip chip-top">Made by students</div>
            <div className="floating-chip chip-bottom">For the whole campus</div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Fresh from the community</span>
              <h2>Recently shared notes</h2>
            </div>
            <Link className="text-link with-arrow" to="/discover">
              Browse all <ArrowRight size={17} />
            </Link>
          </div>
          {loading ? (
            <div className="loading">Loading recent notes…</div>
          ) : error ? (
            <div className="empty">
              <BookOpen size={28} />
              <h3>Recent notes could not load</h3>
              <p>{error}</p>
              <button className="secondary-button" onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          ) : items.length ? (
            <div className="cards-grid">
              {items.map((n) => (
                <NoteCard key={n.id} note={n} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <BookOpen size={28} />
              <h3>Notes will appear here</h3>
              <p>Be the first to share something useful with your classmates.</p>
              <Link className="button" to={user ? '/upload' : '/register'}>
                Share a note
              </Link>
            </div>
          )}
        </div>
      </section>
      <section className="bottom-cta">
        <div className="container bottom-cta-inner">
          <div>
            <span className="eyebrow">Better together</span>
            <h2>Your notes could make someone's day.</h2>
            <p>One upload can help a whole class catch up.</p>
          </div>
          <Link className="button" to={user ? '/upload' : '/register'}>
            Start sharing <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}
