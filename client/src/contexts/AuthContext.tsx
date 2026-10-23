import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, json } from '../services/api';
import type { User } from '../types';
type Auth = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    try {
      setUser(await api<User>('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function login(email: string, password: string) {
    setUser(await api<User>('/auth/login', json('POST', { email, password })));
  }
  async function register(name: string, email: string, password: string) {
    setUser(await api<User>('/auth/register', json('POST', { name, email, password })));
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }
  return (
    <Context.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('Auth provider missing');
  return context;
}
