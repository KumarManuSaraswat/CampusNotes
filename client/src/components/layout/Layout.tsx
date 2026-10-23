import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  UploadCloud,
  Search,
  MessageSquareText,
  ShieldCheck,
  LogOut,
  LayoutDashboard,
  Bookmark,
  Files,
  ArrowUpRight,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  async function signOut() {
    try {
      await logout();
      navigate('/');
      toast('Signed out.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  const links = [
    { path: '/', name: 'Overview', icon: LayoutDashboard },
    { path: '/discover', name: 'Discover notes', icon: Search },
    { path: '/requests', name: 'Community requests', icon: MessageSquareText },
  ];
  const personal = [
    { path: '/saved', name: 'Saved notes', icon: Bookmark },
    { path: '/my-notes', name: 'My uploads', icon: Files },
  ];
  const active =
    [
      ...links,
      ...personal,
      { path: '/upload', name: 'Upload notes' },
      { path: '/admin', name: 'Moderation' },
      { path: '/profile', name: 'Your profile' },
    ].find((x) => x.path === location.pathname)?.name || 'Campus workspace';
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {open && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`workspace-sidebar ${open ? 'is-open' : ''}`}>
        <Link className="brand" to="/" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <BookOpen size={22} />
          </span>
          <span>
            Campus<span className="brand-accent">Notes</span>
            <small>THE STUDENT WORKSPACE</small>
          </span>
        </Link>
        <button
          className="mobile-close icon-link"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {links.map(({ path, name, icon: Icon }) => (
            <NavLink end={path === '/'} key={path} to={path} onClick={() => setOpen(false)}>
              <Icon size={19} />
              {name}
            </NavLink>
          ))}
        </nav>
        {user && (
          <>
            <span className="nav-label">YOUR LIBRARY</span>
            <nav aria-label="Your library">
              {personal.map(({ path, name, icon: Icon }) => (
                <NavLink key={path} to={path} onClick={() => setOpen(false)}>
                  <Icon size={19} />
                  {name}
                </NavLink>
              ))}
              {user.role === 'moderator' && (
                <NavLink to="/admin" onClick={() => setOpen(false)}>
                  <ShieldCheck size={19} />
                  Moderation
                </NavLink>
              )}
            </nav>
          </>
        )}
        <div className="sidebar-callout">
          <span className="callout-icon">
            <Sparkles size={20} />
          </span>
          <h3>Good notes go further.</h3>
          <p>Share what you know. Make someone’s next lecture easier.</p>
          <Link to={user ? '/upload' : '/register'} onClick={() => setOpen(false)}>
            Contribute notes <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="sidebar-account">
          {user ? (
            <>
              <Link to="/profile" onClick={() => setOpen(false)}>
                <span className="avatar">{user.name.charAt(0)}</span>
                <span>
                  <strong>{user.name}</strong>
                  <small>
                    {user.role === 'moderator' ? 'Community moderator' : 'Your student account'}
                  </small>
                </span>
              </Link>
              <button className="icon-link" aria-label="Sign out" onClick={signOut}>
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <Link className="button small" to="/login">
              Sign in to your workspace
            </Link>
          )}
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="topbar-heading">
            <button
              className="mobile-menu icon-link"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <Menu size={22} />
            </button>
            <span>
              Workspace <span className="breadcrumb-slash">/</span> <strong>{active}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <Link className="topbar-search" to="/discover">
              <Search size={17} />
              <span>Find something to learn</span>
            </Link>
            <Link className="button small" to={user ? '/upload' : '/register'}>
              <UploadCloud size={17} />
              {user ? 'Upload notes' : 'Join the community'}
            </Link>
          </div>
        </header>
        <main id="main-content">{children}</main>
        <footer>
          <div className="container footer-inner">
            <span>Made for curious minds.</span>
            <span>
              CampusNotes <span className="footer-dot">•</span> Learn better, together.
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
