'use client';

/**
 * Offline outbox for POS-critical workflows (offline-sync §2 Web PWA row:
 * "IndexedDB outbox queue for sale submission / payment capture").
 *
 * A locally captured sale that cannot reach the API is stored here in the
 * SAME shape the sync push endpoint expects, and drained automatically when
 * connectivity returns (or on app start). Event identity is UUIDv7-style
 * (random UUID is sufficient for outbox identity here — server-side
 * idempotency is enforced by eventId/idempotencyKey/clientDocId).
 */

export interface QueuedSale {
  /** outbox row id (uuid) */
  eventId: string;
  idempotencyKey: string;
  /** the sale payload (CommitSale) incl. clientDocId */
  payload: Record<string, unknown>;
  /** ISO capture time on the device */
  capturedAt: string;
  /** last sync rejection, if any (kept for the attention indicator) */
  lastError?: string;
  attempts: number;
}

const DB_NAME = 'idepot-offline';
const STORE = 'outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'eventId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function enqueueSale(sale: Omit<QueuedSale, 'attempts'>): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put({ ...sale, attempts: 0 } satisfies QueuedSale);
  await txDone(tx);
  db.close();
}

export async function listQueuedSales(): Promise<QueuedSale[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).getAll();
  const rows = await new Promise<QueuedSale[]>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as QueuedSale[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function updateQueuedSale(sale: QueuedSale): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(sale);
  await txDone(tx);
  db.close();
}

export async function removeQueuedSale(eventId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(eventId);
  await txDone(tx);
  db.close();
}

export function randomUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // RFC4122 v4 fallback for non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
