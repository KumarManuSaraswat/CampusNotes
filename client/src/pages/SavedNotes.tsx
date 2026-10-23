import { Bookmark, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NoteCard } from '../components/notes/NoteCard';
import { useSavedNotes } from '../contexts/SavedNotesContext';
export function SavedNotes() {
  const { notes, loading, error } = useSavedNotes();
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">Your study collection</span>
        <h1>
          Saved for later<span className="purple-dot">.</span>
        </h1>
        <p>The notes you want to come back to, all in one place. Saved to your account.</p>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : loading ? (
        <div className="loading">Opening your collection…</div>
      ) : notes.length ? (
        <div className="cards-grid">
          {notes.map((note) => (
            <NoteCard note={note} key={note.id} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Bookmark size={32} />
          <h2>Make room for your next aha moment.</h2>
          <p>Tap the bookmark on any note to keep it here for your next study session.</p>
          <Link className="button" to="/discover">
            Find your first note <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}
