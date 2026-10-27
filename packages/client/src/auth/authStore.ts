/** OWNED BY payments/auth agent. zustand auth store: Google (Supabase) user or guest. */
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { loadGuest, randomGuestName, sanitizeName, saveGuestName } from './guest';

export interface GoogleUser {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

interface AuthState {
  /** 'loading' only while the persisted Supabase session is being restored */
  status: 'loading' | 'ready';
  guest: { id: string; name: string };
  user: GoogleUser | null;
  session: Session | null;
  error: string | null;
  setGuestName: (name: string) => void;
  rerollGuestName: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const RETURN_KEY = 'belot.auth.returnTo';

function userFromSession(session: Session | null): GoogleUser | null {
  const u = session?.user;
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.full_name ?? meta.name ?? u.email?.split('@')[0] ?? 'Player') as string;
  return { id: u.id, name, email: u.email ?? undefined, avatar: (meta.avatar_url ?? meta.picture) as string | undefined };
}

export const useAuthStore = create<AuthState>((set) => ({
  status: supabase ? 'loading' : 'ready',
  guest: loadGuest(),
  user: null,
  session: null,
  error: null,
  setGuestName: (name) => {
    const clean = sanitizeName(name);
    if (!clean) return;
    saveGuestName(clean);
    set((s) => ({ guest: { ...s.guest, name: clean } }));
  },
  rerollGuestName: () => {
    const name = randomGuestName();
    saveGuestName(name);
    set((s) => ({ guest: { ...s.guest, name } }));
  },
  signInWithGoogle: async () => {
    if (!supabase) return;
    try {
      sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
    } catch {
      /* ignore */
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) set({ error: error.message });
  },
  signOut: async () => {
    if (supabase) await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));

/** Path the user was on before starting the OAuth redirect. */
export function consumeReturnPath(): string {
  try {
    const p = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    if (p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/auth/')) return p;
  } catch {
    /* ignore */
  }
  return '/';
}

if (supabase) {
  supabase.auth
    .getSession()
    .then(({ data, error }) => {
      useAuthStore.setState({ session: data.session, user: userFromSession(data.session), status: 'ready', error: error?.message ?? null });
    })
    .catch((e: unknown) => useAuthStore.setState({ status: 'ready', error: String(e) }));
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({ session, user: userFromSession(session), status: 'ready' });
  });
}
