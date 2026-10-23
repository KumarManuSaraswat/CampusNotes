import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordMismatch = mode === 'register' && confirm.length > 0 && password !== confirm;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirm) {
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
      toast(mode === 'login' ? 'Welcome back.' : 'Account created.');
      navigate('/discover');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <div className="auth-icon">
          <BookOpen size={25} />
        </div>
        <span className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Join the community'}</span>
        <h1>{mode === 'login' ? 'Sign in to CampusNotes' : 'Make learning a team effort.'}</h1>
        <p>
          {mode === 'login'
            ? 'Pick up where you left off.'
            : 'Create an account to share and discover notes.'}
        </p>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              Full name
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="field">
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className="field auth-password-field">
            <label htmlFor="auth-password">Password</label>
            <div className="auth-password-control">
              <input
                id="auth-password"
                required
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 8 : 1}
                aria-describedby={mode === 'register' ? 'password-hint' : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="auth-password-toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>
          {mode === 'register' && (
            <>
              <small className="hint" id="password-hint">
                At least 8 characters with uppercase, lowercase, and a number.
              </small>
              <div className="field auth-password-field">
                <label htmlFor="auth-confirm-password">Confirm password</label>
                <div className="auth-password-control">
                  <input
                    id="auth-confirm-password"
                    required
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    aria-invalid={passwordMismatch}
                    aria-describedby={passwordMismatch ? 'password-mismatch-error' : undefined}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <button
                    className="auth-password-toggle"
                    type="button"
                    aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                    aria-pressed={showConfirm}
                    onClick={() => setShowConfirm((visible) => !visible)}
                  >
                    {showConfirm ? (
                      <EyeOff size={18} aria-hidden="true" />
                    ) : (
                      <Eye size={18} aria-hidden="true" />
                    )}
                  </button>
                </div>
                {passwordMismatch && (
                  <p className="form-error password-mismatch" id="password-mismatch-error" role="alert">
                    Passwords do not match.
                  </p>
                )}
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <Link to={mode === 'login' ? '/register' : '/login'}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </Link>
        </p>
      </div>
    </div>
  );
}
