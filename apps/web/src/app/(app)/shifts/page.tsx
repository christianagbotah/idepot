'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession, hasElevatedRole } from '../../../lib/session';
import type { ListDto } from '../../../lib/types';

interface ShiftCashMovementDto {
  id: string; shiftId: string; direction: 'in' | 'out';
  amount: string; reason: string; createdAt: string;
}
interface ShiftDto {
  id: string; code: string; userId: string; userName: string | null;
  status: 'open' | 'closed'; openingFloat: string;
  openedAt: string; closedAt: string | null;
  expectedCash: string | null; countedCash: string | null; variance: string | null;
  movements: ShiftCashMovementDto[];
}

/** Cashier shifts (C-11 corrected): shift-scoped session, expected cash
 *  DERIVED from posted documents, variance reviewed by a supervisor. */
export default function ShiftsPage() {
  const session = useSession();
  const elevated = hasElevatedRole(session);

  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [openingFloat, setOpeningFloat] = useState('0.00');
  const [countedCash, setCountedCash] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async (token: string) => {
    const [s, w] = await Promise.all([
      apiFetch<ListDto<ShiftDto>>('/shifts', { token }),
      apiFetch<ListDto<{ id: string; code: string; name: string }>>('/warehouses', { token }),
    ]);
    setShifts(s.items);
    setWarehouses(w.items);
    setWarehouseId((v) => v || w.items[0]?.id || '');
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken).catch((err) => setError(apiErrorMessage(err)));
  }, [session, load]);

  async function act(fn: () => Promise<void>) {
    if (!session) return;
    setBusy(true);
    setError('');
    setOkMsg('');
    try {
      await fn();
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  const myOpen = shifts.find((s) => s.status === 'open' && s.userId === session.user.id);
  const visible = shifts.filter((s) => elevated || s.userId === session.user.id);

  return (
    <div>
      <div className="page-head"><h1>Cashier shifts</h1></div>
      {error && <p className="error">{error}</p>}
      {okMsg && <p className="muted">{okMsg}</p>}

      {!myOpen ? (
        <section className="card">
          <h2>Open a shift</h2>
          <div className="form-row">
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
            </select>
            <input className="input" placeholder="opening float" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
            <button className="btn btn-primary" type="button" disabled={busy || !warehouseId}
              onClick={() => void act(async () => {
                await apiFetch('/shifts', {
                  method: 'POST', token: session.accessToken,
                  body: { warehouseId, openingFloat },
                });
                setOkMsg('shift opened');
              })}>
              Open shift
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Open shift {myOpen.code}</h2>
          <p className="muted">Opened {new Date(myOpen.openedAt).toLocaleString()} · float {Number(myOpen.openingFloat).toFixed(2)}</p>

          <div className="form-row">
            <input className="input" placeholder="cash in/out amount" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
            <input className="input" placeholder="reason" value={cashReason} onChange={(e) => setCashReason(e.target.value)} />
            <button className="btn" type="button" disabled={busy || !cashAmount || !cashReason}
              onClick={() => void act(async () => {
                await apiFetch(`/shifts/${myOpen.id}/cash`, {
                  method: 'POST', token: session.accessToken,
                  body: { direction: 'in', amount: cashAmount, reason: cashReason },
                });
                setCashAmount('');
                setCashReason('');
                setOkMsg('cash paid in recorded');
              })}>Paid in</button>
            <button className="btn" type="button" disabled={busy || !cashAmount || !cashReason}
              onClick={() => void act(async () => {
                await apiFetch(`/shifts/${myOpen.id}/cash`, {
                  method: 'POST', token: session.accessToken,
                  body: { direction: 'out', amount: cashAmount, reason: cashReason },
                });
                setCashAmount('');
                setCashReason('');
                setOkMsg('cash paid out recorded');
              })}>Paid out</button>
          </div>

          <div className="form-row">
            <input className="input" placeholder="counted cash at close" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
            <button className="btn btn-primary" type="button" disabled={busy || !countedCash}
              onClick={() => void act(async () => {
                const res = await apiFetch<ShiftDto>(`/shifts/${myOpen.id}/close`, {
                  method: 'POST', token: session.accessToken,
                  body: { countedCash },
                });
                setCountedCash('');
                setOkMsg(
                  res.variance != null && Number(res.variance) !== 0
                    ? `shift closed — variance ${Number(res.variance).toFixed(2)} (supervisor review recorded)`
                    : 'shift closed — no variance',
                );
              })}>Close shift</button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Shift history</h2>
        <table className="table">
          <thead>
            <tr><th>Shift</th><th>Cashier</th><th>Opened</th><th>Closed</th>
              <th style={{ textAlign: 'right' }}>Expected</th><th style={{ textAlign: 'right' }}>Counted</th>
              <th style={{ textAlign: 'right' }}>Variance</th><th /></tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id}>
                <td>{s.code}</td>
                <td>{s.userName ?? '—'}</td>
                <td>{new Date(s.openedAt).toLocaleString()}</td>
                <td>{s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}</td>
                <td style={{ textAlign: 'right' }}>{s.expectedCash != null ? Number(s.expectedCash).toFixed(2) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{s.countedCash != null ? Number(s.countedCash).toFixed(2) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{s.variance != null ? Number(s.variance).toFixed(2) : '—'}</td>
                <td>
                  {s.status === 'closed' && s.variance != null && Number(s.variance) !== 0 && elevated && (
                    <button className="btn btn-sm" type="button" disabled={busy}
                      onClick={() => void act(async () => {
                        await apiFetch(`/shifts/${s.id}/review-variance`, { method: 'POST', token: session.accessToken });
                        setOkMsg(`variance of ${s.code} reviewed`);
                      })}>Review</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="muted">No shifts yet.</p>}
      </section>
    </div>
  );
}
