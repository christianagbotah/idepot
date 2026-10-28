'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { formatDateTime } from '../lib/format';
import type { ListDto } from '../lib/types';
import { StatusBadge } from './status-badge';

/** Minimal party shape shared by CustomerDto / SupplierDto. */
interface PartyDto {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Draft {
  name: string;
  phone: string;
  email: string;
  contactPerson: string;
  address: string;
}

function draftOf(p: PartyDto): Draft {
  return {
    name: p.name,
    phone: p.phone,
    email: p.email ?? '',
    contactPerson: p.contactPerson ?? '',
    address: p.address ?? '',
  };
}

/**
 * Shared list/create/inline-edit manager for the two party types
 * (customers at /customers, suppliers at /suppliers).
 */
export function PartyCrud({ title, endpoint, emptyText }: { title: string; endpoint: string; emptyText: string }) {
  const session = useSession();

  const [items, setItems] = useState<PartyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: '', phone: '', email: '', contactPerson: '', address: '' });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

  const load = useCallback(
    async (token: string) => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await apiFetch<ListDto<PartyDto>>(endpoint, { token });
        setItems(res.items);
      } catch (err) {
        setLoadError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
  }, [session, load]);

  function validate(d: { name: string; phone: string; email: string }): string {
    if (d.name.trim().length < 2) return 'Name must be at least 2 characters.';
    if (d.phone.trim().length < 7 || d.phone.trim().length > 25) {
      return 'Phone is required (7–25 characters).';
    }
    if (d.email.trim() && !EMAIL_RE.test(d.email.trim())) return 'Email is not a valid address.';
    return '';
  }

  async function createParty(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFormError('');
    setOkMsg('');
    const invalid = validate({ name, phone, email });
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setBusy(true);
    try {
      await apiFetch<PartyDto>(endpoint, {
        method: 'POST',
        token: session.accessToken,
        body: {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          contactPerson: contactPerson.trim() || undefined,
          address: address.trim() || undefined,
        },
      });
      setName('');
      setPhone('');
      setEmail('');
      setContactPerson('');
      setAddress('');
      setOkMsg('Created.');
      await load(session.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: PartyDto) {
    setEditingId(p.id);
    setEditError('');
    setDraft(draftOf(p));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function saveEdit(id: string) {
    if (!session) return;
    setEditError('');
    const invalid = validate(draft);
    if (invalid) {
      setEditError(invalid);
      return;
    }
    setEditBusy(true);
    try {
      await apiFetch<PartyDto>(`${endpoint}/${id}`, {
        method: 'PATCH',
        token: session.accessToken,
        body: {
          name: draft.name.trim(),
          phone: draft.phone.trim(),
          email: draft.email.trim() || undefined,
          contactPerson: draft.contactPerson.trim() || undefined,
          address: draft.address.trim() || undefined,
        },
      });
      setEditingId(null);
      await load(session.accessToken);
    } catch (err) {
      setEditError(apiErrorMessage(err));
    } finally {
      setEditBusy(false);
    }
  }

  if (!session) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
        <span className="muted">{items.length} record{items.length === 1 ? '' : 's'}</span>
      </div>

      <section className="card">
        <h2>New {title.toLowerCase().replace(/s$/, '')}</h2>
        <form className="form-grid" onSubmit={(e) => void createParty(e)}>
          <label>
            <span className="muted">Name *</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label>
            <span className="muted">Phone * (7–25 chars)</span>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +233 24 123 4567"
              required
            />
          </label>
          <label>
            <span className="muted">Email (optional)</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <span className="muted">Contact person (optional)</span>
            <input
              className="input"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          </label>
          <label className="span-2">
            <span className="muted">Address (optional)</span>
            <input
              className="input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <div className="span-2">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create'}
            </button>
            {formError ? (
              <p className="error-text" role="alert">
                {formError}
              </p>
            ) : null}
            {okMsg ? <p className="ok-text" role="status">{okMsg}</p> : null}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>All {title.toLowerCase()}</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <p className="muted">{emptyText}</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Contact</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) =>
                  editingId === p.id ? (
                    <tr key={p.id}>
                      <td>{p.code}</td>
                      <td colSpan={6}>
                        <div className="form-grid">
                          <label>
                            <span className="muted">Name *</span>
                            <input
                              className="input"
                              value={draft.name}
                              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            />
                          </label>
                          <label>
                            <span className="muted">Phone *</span>
                            <input
                              className="input"
                              value={draft.phone}
                              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                            />
                          </label>
                          <label>
                            <span className="muted">Email</span>
                            <input
                              className="input"
                              value={draft.email}
                              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                            />
                          </label>
                          <label>
                            <span className="muted">Contact person</span>
                            <input
                              className="input"
                              value={draft.contactPerson}
                              onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })}
                            />
                          </label>
                          <label className="span-2">
                            <span className="muted">Address</span>
                            <input
                              className="input"
                              value={draft.address}
                              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                            />
                          </label>
                        </div>
                        {editError ? (
                          <p className="error-text" role="alert">
                            {editError}
                          </p>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td>
                        <div className="toolbar">
                          <button
                            className="btn"
                            type="button"
                            disabled={editBusy}
                            onClick={() => void saveEdit(p.id)}
                          >
                            {editBusy ? 'Saving…' : 'Save'}
                          </button>
                          <button className="btn" type="button" disabled={editBusy} onClick={cancelEdit}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id}>
                      <td>{p.code}</td>
                      <td>{p.name}</td>
                      <td>{p.phone}</td>
                      <td>{p.email ?? '—'}</td>
                      <td>{p.contactPerson ?? '—'}</td>
                      <td>{p.address ?? '—'}</td>
                      <td>
                        <StatusBadge status={p.status} />
                        <div className="muted">{formatDateTime(p.createdAt)}</div>
                      </td>
                      <td>
                        <button className="btn" type="button" onClick={() => startEdit(p)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
