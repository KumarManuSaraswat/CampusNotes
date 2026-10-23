import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { Layout } from './components/layout/Layout';
import { Home } from './pages/Home';
import { AuthPage } from './pages/Auth';
import { Discover } from './pages/Discover';
import { Upload } from './pages/Upload';
import { NoteDetail } from './pages/NoteDetail';
import { MyNotes } from './pages/MyNotes';
import { Profile } from './pages/Profile';
import { Requests } from './pages/Requests';
import { Admin } from './pages/Admin';
import { SavedNotes } from './pages/SavedNotes';
import { SavedNotesProvider } from './contexts/SavedNotesContext';
class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CampusNotes page render failed', error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="container page empty" role="alert">
          <h1>Something went wrong</h1>
          <p>This page could not be displayed.</p>
          <button className="button" onClick={() => window.location.reload()}>
            Reload CampusNotes
          </button>
        </main>
      );
    return this.props.children;
  }
}
function Protected({
  children,
  moderator = false,
}: {
  children: React.ReactNode;
  moderator?: boolean;
}) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container page loading">Checking your session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (moderator && user.role !== 'moderator') return <Navigate to="/" replace />;
  return <>{children}</>;
}
function Content() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/notes/:id" element={<NoteDetail />} />
        <Route path="/requests" element={<Requests />} />
        <Route
          path="/saved"
          element={
            <Protected>
              <SavedNotes />
            </Protected>
          }
        />
        <Route
          path="/upload"
          element={
            <Protected>
              <Upload />
            </Protected>
          }
        />
        <Route
          path="/my-notes"
          element={
            <Protected>
              <MyNotes />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <Profile />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected moderator>
              <Admin />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <SavedNotesProvider>
              <Content />
            </SavedNotesProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
