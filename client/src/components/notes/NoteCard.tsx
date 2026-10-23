import { Link } from 'react-router-dom';
import { FileText, Image, ArrowUpRight, Bookmark, ArrowUp } from 'lucide-react';
import type { NoteDto } from '@campusnotes/shared';
import { useSavedNotes } from '../../contexts/SavedNotesContext';
export function NoteCard({ note }: { note: NoteDto }) {
  const { notes, toggle, pending } = useSavedNotes();
  const saved = notes.some((n) => n.id === note.id);
  const subject = note.subject || note.studyAssessment?.subject || 'General studies';
  const tags = note.tags.length ? note.tags : note.studyAssessment?.tags || [];
  const tone = ['lilac', 'peach', 'mint', 'blue'][
    Array.from(subject).reduce((n, c) => n + c.charCodeAt(0), 0) % 4
  ];
  return (
    <article className={`note-card tone-${tone}`}>
      <div className="note-cover">
        <span className="cover-pattern" aria-hidden="true" />
        <span className="file-type">
          {note.fileType === 'application/pdf' ? <FileText size={15} /> : <Image size={15} />}{' '}
          {note.fileType === 'application/pdf' ? 'PDF DOCUMENT' : 'IMAGE NOTES'}
        </span>
        <span className="cover-subject">{subject}</span>
        <button
          className={`bookmark-button ${saved ? 'is-saved' : ''}`}
          aria-label={`${saved ? 'Unsave' : 'Save'} ${note.title}`}
          aria-pressed={saved}
          disabled={pending.has(note.id)}
          onClick={() => void toggle(note)}
        >
          <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="note-card-body">
        <Link className="note-title-link" to={'/notes/' + note.id}>
          <h3>{note.title}</h3>
          <ArrowUpRight size={19} />
        </Link>
        <p>
          {note.description ||
            note.studyAssessment?.reason ||
            'A fresh perspective from your campus community.'}
        </p>
        <div className="tag-row">
          {tags.slice(0, 3).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <div className="card-meta">
          <span className="mini-avatar">{note.uploadedBy.name.charAt(0)}</span>
          <span>
            {note.uploadedBy.name}
            <small>
              {new Date(note.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </small>
          </span>
          <span className="card-score">
            <ArrowUp size={14} />
            {note.score}
          </span>
        </div>
      </div>
    </article>
  );
}
