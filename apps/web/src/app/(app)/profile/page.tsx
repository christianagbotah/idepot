'use client';

import { useState } from 'react';
import { useSession } from '../../../lib/session';
import { apiFetch, apiErrorMessage } from '../../../lib/api';

/** Own profile (legacy manage_profile.php): display name + password change. */
export default function ProfilePage() {
  const session = useSession();
  const [displayName, setDisplayName] = useState(session?.user.displayName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okName, setOkName] = useState('');
  const [okPass, setOkPass] = useState('');

  async function saveProfile() {
    if (!session) return;
    setBusy(true);
    setError('');
    setOkName('');
    try {
      await apiFetch('/auth/profile', {
        method: 'POST',
        body: { displayName },
        token: session.accessToken,
      });
      setOkName('Display name saved.');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (!session) return;
    if (newPassword !== confirmPassword) {
      setError('The new password and its confirmation do not match.');
      return;
    }
    setBusy(true);
    setError('');
    setOkPass('');
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
        token: session.accessToken,
      });
      setOkPass('Password changed. Use it the next time you sign in.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Loading…</p>;

  return (
    <section style={{ maxWidth: 560 }}>
      <h1>My Profile</h1>
      <p className="muted">
        {session.user.email} · {session.user.tenantSlug} · {session.user.roles.join(', ')}
      </p>

      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Display name</h3>
        <label>
          Name shown on documents and audit entries
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            type="button"
            onClick={saveProfile}
            disabled={busy || !displayName}
          >
            Save
          </button>
        </div>
        {okName && <div className="alert ok">{okName}</div>}
      </div>

      <div className="card">
        <h3>Change password</h3>
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <label>
          New password (min 8 chars)
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            type="button"
            onClick={changePassword}
            disabled={busy || !currentPassword || newPassword.length < 8 || !confirmPassword}
          >
            Change password
          </button>
        </div>
        {okPass && <div className="alert ok">{okPass}</div>}
      </div>
    </section>
  );
}
