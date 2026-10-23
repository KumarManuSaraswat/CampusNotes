import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { NoteDto } from '@campusnotes/shared';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
const Context = createContext<{
  notes: NoteDto[];
  loading: boolean;
  error: string;
  toggle: (note: NoteDto) => Promise<void>;
  pending: Set<string>;
}>({ notes: [], loading: false, error: '', toggle: async () => {}, pending: new Set() });
export function SavedNotesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(new Set<string>());
  const inFlight = useRef(new Set<string>());
  const account = useRef(user?.id);
  account.current = user?.id;
  useEffect(() => {
    const controller = new AbortController();
    setNotes([]);
    setError('');
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<NoteDto[]>('/users/me/saved-notes', { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) setNotes(items);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user?.id]);
  async function toggle(note: NoteDto) {
    if (!user) {
      toast('Sign in to save notes to your library.', 'error');
      return;
    }
    if (inFlight.current.has(note.id)) return;
    const owner = user.id;
    const saved = notes.some((n) => n.id === note.id);
    inFlight.current.add(note.id);
    setPending(new Set(inFlight.current));
    try {
      await api(`/notes/${note.id}/bookmark`, { method: saved ? 'DELETE' : 'PUT' });
      if (account.current === owner) {
        setNotes((current) =>
          saved
            ? current.filter((n) => n.id !== note.id)
            : [note, ...current.filter((n) => n.id !== note.id)],
        );
        toast(saved ? 'Removed from saved notes.' : 'Saved to your library.');
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      inFlight.current.delete(note.id);
      setPending(new Set(inFlight.current));
    }
  }
  return (
    <Context.Provider value={{ notes, loading, error, toggle, pending }}>
      {children}
    </Context.Provider>
  );
}
export const useSavedNotes = () => useContext(Context);
