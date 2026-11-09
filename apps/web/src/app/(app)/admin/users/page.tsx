'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../../lib/session';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { formatDateTime } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  status: string;
  createdAt: string;
}

const ALL_ROLES = ['owner', 'admin', 'manager', 'cashier', 'auditor', 'accountant', 'procurement'];

/** Users & roles administration (legacy admin_list.php + add/edit modals).
 *  Owner/admin only — the server enforces `users:manage` regardless. */
export default function UsersAdminPage() {
  const session = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(['cashier']);

  // edit target
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState('active');
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        setUsers(await apiFetch<UserRow[]>(`/admin/users${qs({ status: statusFilter || undefined })}`, { token }));
        setError('');
      } catch (err) {
        setError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    if (session) void load(session.accessToken);
  }, [session, load]);

  function toggleRole(list: string[], role: string): string[] {
    return list.includes(role) ? list.filter((r) => r !== role) : [...list, role];
  }

  async function createUser() {
    if (!session) return;
    setBusy(true);
    setOkMsg('');
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: { email, displayName, password, roles },
        token: session.accessToken,
      });
      setOkMsg(`User ${email} created.`);
      setShowCreate(false);
      setEmail('');
      setDisplayName('');
      setPassword('');
      setRoles(['cashier']);
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!session || !editing) return;
    setBusy(true);
    setOkMsg('');
    try {
      await apiFetch(`/admin/users/${editing.id}`, {
        method: 'PATCH',
        body: { displayName: editName, roles: editRoles, status: editStatus },
        token: session.accessToken,
      });
      setOkMsg(`User ${editing.email} updated.`);
      setEditing(null);
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!session || !resetting) return;
    setBusy(true);
    setOkMsg('');
    try {
      await apiFetch(`/admin/users/${resetting.id}/reset-password`, {
        method: 'POST',
        body: { password: newPassword },
        token: session.accessToken,
      });
      setOkMsg(`Password reset for ${resetting.email}.`);
      setResetting(null);
      setNewPassword('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const me = session?.user;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Users &amp; Roles</h1>
          <p className="muted">
            Tenant staff accounts, roles and status. Role changes are audited; passwords are Argon2id
            hashes and never shown.
          </p>
        </div>
        <button
          className="btn primary"
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          disabled={busy}
        >
          {showCreate ? 'Close' : 'Add user'}
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {okMsg && <div className="alert ok">{okMsg}</div>}

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>New user</h3>
          <div className="form-grid">
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@depot.example" />
            </label>
            <label>
              Display name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" />
            </label>
            <label>
              Initial password (min 8 chars)
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          </div>
          <fieldset style={{ border: 0, padding: 0, marginTop: 8 }}>
            <legend className="muted">Roles (at least one; the owner role is reserved)</legend>
            {ALL_ROLES.filter((r) => r !== 'owner').map((r) => (
              <label key={r} className="check">
                <input
                  type="checkbox"
                  checked={roles.includes(r)}
                  onChange={() => setRoles(toggleRole(roles, r))}
                />{' '}
                {r}
              </label>
            ))}
          </fieldset>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button
              className="btn primary"
              type="button"
              onClick={createUser}
              disabled={busy || !email || !displayName || password.length < 8 || roles.length === 0}
            >
              Create user
            </button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <label className="muted">
          Status filter{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Display name</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.email}
                    {me && u.id === me.id && <span className="muted"> (you)</span>}
                  </td>
                  <td>{u.displayName}</td>
                  <td>{u.roles.join(', ')}</td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td>{formatDateTime(u.createdAt)}</td>
                  <td>
                    <button
                      className="btn sm"
                      type="button"
                      onClick={() => {
                        setEditing(u);
                        setEditName(u.displayName);
                        setEditRoles(u.roles);
                        setEditStatus(u.status);
                      }}
                    >
                      Edit
                    </button>{' '}
                    <button className="btn sm" type="button" onClick={() => setResetting(u)}>
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No users match the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Edit {editing.email}</h3>
          <div className="form-grid">
            <label>
              Display name
              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label>
              Status
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
          </div>
          <fieldset style={{ border: 0, padding: 0, marginTop: 8 }}>
            <legend className="muted">Roles (you cannot edit your own account)</legend>
            {ALL_ROLES.map((r) => (
              <label key={r} className="check">
                <input
                  type="checkbox"
                  checked={editRoles.includes(r)}
                  disabled={r === 'owner' && !editing.roles.includes('owner')}
                  onChange={() => setEditRoles(toggleRole(editRoles, r))}
                />{' '}
                {r}
              </label>
            ))}
          </fieldset>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button
              className="btn primary"
              type="button"
              onClick={saveEdit}
              disabled={busy || editRoles.length === 0 || !editName}
            >
              Save changes
            </button>{' '}
            <button className="btn" type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {resetting && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Reset password — {resetting.email}</h3>
          <p className="muted">
            The new password takes effect immediately; the user&apos;s current sessions keep working
            until their token expires.
          </p>
          <div className="form-grid">
            <label>
              New password (min 8 chars)
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button
              className="btn primary"
              type="button"
              onClick={resetPassword}
              disabled={busy || newPassword.length < 8}
            >
              Reset password
            </button>{' '}
            <button
              className="btn"
              type="button"
              onClick={() => {
                setResetting(null);
                setNewPassword('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
