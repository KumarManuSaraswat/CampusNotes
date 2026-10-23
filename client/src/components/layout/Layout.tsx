import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  UploadCloud,
  Search,
  MessageSquareText,
  UserRound,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  async function signOut() {
    try {
      await logout();
      navigate('/');
      toast('Signed out.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  return (
    <>
      <header className="site-header">
        <div className="container nav">
          <Link className="brand" to="/">
            <span className="brand-mark">
              <BookOpen size={22} />
            </span>
            <span>
              Campus<span className="brand-accent">Notes</span>
            </span>
          </Link>
          <nav aria-label="Main navigation">
            <NavLink to="/discover">
              <Search size={17} /> Discover
            </NavLink>
            <NavLink to="/requests">
              <MessageSquareText size={17} /> Requests
            </NavLink>
            {user && (
              <NavLink to="/upload">
                <UploadCloud size={17} /> Upload
              </NavLink>
            )}
            {user && <NavLink to="/my-notes">My notes</NavLink>}
          </nav>
          <div className="nav-actions">
            {user ? (
              <>
                <Link className="user-link" to="/profile">
                  <UserRound size={17} />
                  <span>{user.name.split(' ')[0]}</span>
                </Link>
                {user.role === 'moderator' && (
                  <Link className="icon-link" title="Moderation" to="/admin">
                    <ShieldCheck size={18} />
                  </Link>
                )}
                <button
                  className="icon-link"
                  title="Sign out"
                  aria-label="Sign out"
                  onClick={signOut}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <Link className="text-link" to="/login">
                  Log in
                </Link>
                <Link className="button small" to="/register">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div className="container footer-inner">
          <span>CampusNotes</span>
          <span>Good notes go further together.</span>
        </div>
      </footer>
    </>
  );
}
