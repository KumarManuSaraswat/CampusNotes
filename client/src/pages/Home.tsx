import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  UploadCloud,
  Bookmark,
  MessageSquareText,
  Sparkles,
  BookOpen,
  Check,
} from 'lucide-react';
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
    const controller = new AbortController();
    api<{ items: NoteDto[] }>('/notes?limit=3', { signal: controller.signal })
      .then((d) => setItems(d.items))
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="container page dashboard-page">
      <div className="dashboard-greeting">
        <div>
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>
            {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'A little clarity goes a long way'}
            <span className="purple-dot">.</span>
          </h1>
          <p>A shared space for big ideas, better notes, and your next aha moment.</p>
        </div>
        <span className="workspace-badge">
          <span /> A space to grow
        </span>
      </div>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="hero-kicker">
            <Sparkles size={15} /> STUDY TOGETHER. GO FURTHER.
          </span>
          <h2>
            Less searching.
            <br />
            More <em>understanding.</em>
          </h2>
          <p>
            The lecture you missed. The concept that finally clicks.
            <br className="desktop-break" /> Find your next breakthrough in notes from your
            community.
          </p>
          <form
            className="workspace-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate('/discover?q=' + encodeURIComponent(search.trim()));
            }}
          >
            <Search size={20} />
            <input
              aria-label="Search notes"
              placeholder="What are you learning today?"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button aria-label="Find notes">
              <ArrowRight size={20} />
            </button>
          </form>
          <div className="popular-topics">
            <span>Explore</span>
            {['Mathematics', 'Computer Science', 'Physics'].map((subject) => (
              <Link key={subject} to={'/discover?subject=' + encodeURIComponent(subject)}>
                {subject}
              </Link>
            ))}
          </div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-halo" />
          <div className="floating-label">
            <Sparkles size={16} /> A little inspiration
          </div>
          <div className="notebook-back" />
          <div className="notebook">
            <div className="notebook-binding" />
            <span className="notebook-label">THE KNOWLEDGE COLLECTIVE</span>
            <BookOpen size={37} />
            <h3>
              Good notes.
              <br />
              Great possibilities.
            </h3>
            <div className="notebook-line" />
            <div className="notebook-line short" />
            <span className="notebook-sticker">Keep being curious ✦</span>
          </div>
          <div className="floating-check">
            <Check size={18} /> Learn something new
          </div>
        </div>
      </section>
      <div className="quick-actions">
        <Link to={user ? '/upload' : '/register'}>
          <span className="quick-icon purple">
            <UploadCloud size={23} />
          </span>
          <div>
            <h3>Share your knowledge</h3>
            <p>Upload notes. Help a classmate.</p>
          </div>
          <ArrowUpRight size={19} />
        </Link>
        <Link to={user ? '/saved' : '/login'}>
          <span className="quick-icon peach">
            <Bookmark size={23} />
          </span>
          <div>
            <h3>Your study collection</h3>
            <p>Save now. Come back inspired.</p>
          </div>
          <ArrowUpRight size={19} />
        </Link>
        <Link to="/requests">
          <span className="quick-icon mint">
            <MessageSquareText size={23} />
          </span>
          <div>
            <h3>Ask the community</h3>
            <p>Missing a lecture? Start here.</p>
          </div>
          <ArrowUpRight size={19} />
        </Link>
      </div>
      <section className="latest-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FRESH PERSPECTIVES</span>
            <h2>New in the library</h2>
          </div>
          <Link className="text-link" to="/discover">
            Explore all notes <ArrowRight size={16} />
          </Link>
        </div>
        {error ? (
          <div className="soft-banner" role="alert">
            <strong>The library couldn’t load just now.</strong>
            <p>{error}</p>
            <Link to="/discover" className="text-link">
              Try discovery →
            </Link>
          </div>
        ) : loading ? (
          <div className="cards-grid" aria-label="Loading notes">
            {[0, 1, 2].map((n) => (
              <div className="card-skeleton" key={n} />
            ))}
          </div>
        ) : items.length ? (
          <div className="cards-grid">
            {items.map((note) => (
              <NoteCard note={note} key={note.id} />
            ))}
          </div>
        ) : (
          <div className="library-empty">
            <span className="quick-icon purple">
              <BookOpen size={28} />
            </span>
            <div>
              <h3>Every great library starts with one idea.</h3>
              <p>Be the first to share a set of study notes with your community.</p>
            </div>
            <Link className="secondary-button" to={user ? '/upload' : '/register'}>
              Share the first note <ArrowUpRight size={17} />
            </Link>
          </div>
        )}
      </section>
      <div className="community-strip">
        <span>✦</span>
        <p>Knowledge is better when it’s shared.</p>
        <Link to="/requests">
          Make someone’s day <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
