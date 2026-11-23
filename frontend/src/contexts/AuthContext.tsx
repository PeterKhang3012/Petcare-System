import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { session } from '../api/client';
import { auth } from '../services';
import type { Credentials, User } from '../types';

type AuthState = { user: User | null; loading: boolean; error?: unknown; signIn: (input: Credentials) => Promise<User>; signOut: () => void; retry: () => void };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(session.get()));
  const [error, setError] = useState<unknown>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const expire = () => { setUser(null); setError(undefined); setLoading(false); };
    window.addEventListener('pawstay:session-expired', expire);
    if (session.get()) {
      auth.me().then(
        result => { if (active) setUser(result.user); },
        failure => { if (active && session.get()) setError(failure); },
      ).finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; window.removeEventListener('pawstay:session-expired', expire); };
  }, [revision]);
  const signOut = () => { session.clear(); setUser(null); setError(undefined); };
  const signIn = async (input: Credentials) => {
    const { accessToken } = await auth.login(input);
    session.set(accessToken);
    try {
      const result = await auth.me();
      setUser(result.user);
      return result.user;
    } catch (failure) {
      signOut();
      throw failure;
    }
  };
  return <AuthContext.Provider value={{ user, loading, error, signIn, signOut, retry: () => { setError(undefined); setLoading(true); setRevision(value => value + 1); } }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Thiếu ngữ cảnh xác thực');
  return value;
}
