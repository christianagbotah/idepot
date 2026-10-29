'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, apiErrorMessage } from '../lib/api';
import { writeSession } from '../lib/session';
import type { Session, TokenPair } from '../lib/types';

/**
 * Login scaffold: authenticates against the API and persists the session
 * ({ accessToken, refreshToken, user }) to localStorage['idepot.session']
 * before entering the authenticated app shell at /catalog.
 */
export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'error' | 'ok'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('busy');
    setMessage('');
    try {
      const pair = await apiFetch<TokenPair>('/auth/login', {
        method: 'POST',
        body: { tenantSlug, email, password },
      });
      const session: Session = {
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        user: pair.user,
      };
      writeSession(session);
      setStatus('ok');
      setMessage('Signed in. Opening your workspace…');
      router.replace('/catalog');
    } catch (err) {
      setStatus('error');
      setMessage(apiErrorMessage(err));
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--idp-space-8)',
      }}
    >
      <div className="card" style={{ width: 380 }}>
        <h1 style={{ marginTop: 0, fontSize: 'var(--idp-text-xl)' }}>iDepot</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in to your organization workspace.
        </p>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 'var(--idp-space-3)' }}>
          <label>
            <span className="muted">Organization</span>
            <input
              className="input"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="tenant-a"
              required
              minLength={2}
            />
          </label>
          <label>
            <span className="muted">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </label>
          <label>
            <span className="muted">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <button className="btn" type="submit" disabled={status === 'busy'}>
            {status === 'busy' ? 'Signing in…' : 'Sign in'}
          </button>
          {message ? (
            <p
              className="muted"
              role="status"
              style={{ color: status === 'error' ? 'var(--idp-color-danger)' : undefined }}
            >
              {message}
            </p>
          ) : null}
        </form>
      </div>
    </main>
  );
}
