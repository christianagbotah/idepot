'use client';

import { useState } from 'react';

/**
 * Design-system baseline + auth scaffold (Phase 1 shell).
 * Real auth wiring to the API arrives with the first product phase.
 */
export default function LoginPage() {
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
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantSlug, email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus('error');
        setMessage(body.error ?? `login failed (${res.status})`);
        return;
      }
      setStatus('ok');
      setMessage('Signed in. (Session handling arrives with the first product phase.)');
    } catch {
      setStatus('error');
      setMessage('API unreachable');
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
