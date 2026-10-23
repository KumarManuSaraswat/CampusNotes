import { Link } from 'react-router-dom';
import { FileText, Image, ArrowUp, CalendarDays } from 'lucide-react';
import type { NoteDto } from '@campusnotes/shared';
export function NoteCard({ note }: { note: NoteDto }) {
  return (
    <Link to={'/notes/' + note.id} className="note-card">
      <div className="note-card-top">
        <span className="file-icon">
          {note.fileType === 'application/pdf' ? <FileText size={23} /> : <Image size={23} />}
        </span>
        <span className="pill">{note.subject || 'Uncategorized'}</span>
      </div>
      <h3>{note.title}</h3>
      <p>{note.description || 'Shared lecture notes ready to explore.'}</p>
      <div className="tag-row">
        {note.tags.slice(0, 3).map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <div className="card-meta">
        <span>by {note.uploadedBy.name}</span>
        <span>
          <CalendarDays size={14} />
          {new Date(note.createdAt).toLocaleDateString()}
        </span>
        <span>
          <ArrowUp size={14} />
          {note.score}
        </span>
      </div>
    </Link>
  );
}
