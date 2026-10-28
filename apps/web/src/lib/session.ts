'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from './types';

export const SESSION_KEY = 'idepot.session';

/** SSR-safe localStorage read of the stored session. */
export function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed || typeof parsed.accessToken !== 'string' || !parsed.user) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
}

/**
 * Reads the session from localStorage after mount; redirects to the login
 * page ('/') when absent. Returns null until the session is available, so
 * callers can render a loading state.
 */
export function useSession(): Session | null {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = readSession();
    if (!s) {
      router.replace('/');
      return;
    }
    setSession(s);
  }, [router]);

  return session;
}

/** True when the session user holds one of the elevated roles. */
export function hasElevatedRole(session: Session | null): boolean {
  if (!session) return false;
  return session.user.roles.some((r) => r === 'manager' || r === 'admin' || r === 'owner');
}
