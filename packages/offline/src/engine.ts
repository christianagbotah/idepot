/**
 * Offline-first engine core (docs/architecture/offline-sync.md §2–§7,
 * Phase 6 B3). Storage-agnostic by design:
 *
 *   - Tauri desktop: SQLite via tauri-plugin-sql (apps/desktop adapter)
 *   - React Native:  expo-sqlite / op-sqlite (apps/mobile adapter)
 *   - tests:         InMemoryOfflineStorage (below) — full semantics without a device
 *
 * The SERVER remains authoritative on stock balances, tax, money, prices,
 * allocations and sequences (B3 rule). This engine provides:
 *   1. a durable local REPLICA of reference data (pull projections);
 *   2. a TRANSACTIONAL OUTBOX — every local mutation writes its event in the
 *      SAME storage transaction as the data (on-device transactional outbox);
 *   3. dependency-ordered, idempotent PUSH with exponential backoff + jitter;
 *   4. resumable, checkpointed PULL with a persisted cursor;
 *   5. an explicit CONFLICT QUEUE — conflicts are never silently dropped
 *      (they await human resolution with full context).
 */

/* ------------------------------ storage driver ----------------------------- */

/** Minimal synchronous-ish SQL surface the engine needs. Deliberately tiny so
 *  SQLite (better-sqlite3 / tauri-plugin-sql / expo-sqlite) adapters are ~30
 *  lines each. Transactions are SERIALIZABLE by the driver (SQLite default). */
export interface OfflineStorage {
  /** run DDL/updates; returns affected rows */
  exec(sql: string, params?: unknown[]): number;
  /** select rows */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  /** run fn atomically — all statements inside commit or none do */
  transaction<T>(fn: () => T): T;
}

/** In-memory storage implementing the engine's SQL surface with SQLite-style
 *  positional binding. Supported forms (the engine + default projectors use
 *  exactly these): CREATE TABLE / DROP TABLE, INSERT INTO t (cols) VALUES
 *  (…), UPDATE t SET a=?,… WHERE col=?, DELETE FROM t WHERE col=?|literal,
 *  SELECT … FROM t [WHERE col=?|literal] [ORDER BY col]. */
export class InMemoryOfflineStorage implements OfflineStorage {
  private readonly tables = new Map<string, Array<Record<string, unknown>>>();
  /** column DEFAULTs parsed from DDL (applied on INSERT like SQLite). */
  private readonly defaults = new Map<string, Record<string, unknown>>();
  /** PRIMARY KEY / UNIQUE columns per table (duplicate INSERT throws). */
  private readonly uniques = new Map<string, string[][]>();

  exec(sql: string, params: unknown[] = []): number {
    // strip SQL line comments (the engine's DDL carries documentation comments)
    const s = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
    let m = /^CREATE TABLE (?:IF NOT EXISTS )?(\w+) \((.+)\)$/i.exec(s);
    if (m) {
      const table = m[1]!;
      if (!this.tables.has(table)) this.tables.set(table, []);
      // parse column DEFAULTs so INSERTs behave like SQLite
      const defs: Record<string, unknown> = {};
      const uniqueCols: Record<string, string[][]> = {};
      for (const colDef of m[2]!.split(/,(?![^()]*\))/)) {
        const dm = /^(\w+)\b[\s\S]*?DEFAULT (?:'([^']*)'|(-?\d+(?:\.\d+)?))\s*$/i.exec(colDef.trim());
        if (dm) defs[dm[1]!] = dm[2] !== undefined ? dm[2] : Number(dm[3]);
        const um = /^(\w+)[^,]*?\b(?:PRIMARY KEY|UNIQUE)\b/i.exec(colDef.trim());
        if (um) (uniqueCols[table] ??= []).push([um[1]!]);
      }
      this.defaults.set(table, defs);
      // table-level UNIQUE (a, b) constraints — one entry per constraint
      for (const u of [...m[2]!.matchAll(/UNIQUE \(([^)]+)\)/gi)]) {
        uniqueCols[table] ??= [];
        uniqueCols[table]!.push(u[1]!.split(',').map((c) => c.trim()));
      }
      this.uniques.set(table, uniqueCols[table] ?? []);
      return 0;
    }
    m = /^DROP TABLE (?:IF EXISTS )?(\w+)/i.exec(s);
    if (m) {
      this.tables.delete(m[1]!);
      return 0;
    }
    m = /^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)$/i.exec(s);
    if (m) {
      const table = m[1]!;
      const cols = m[2]!.split(',').map((c) => c.trim());
      // VALUES tokens: placeholders (bound in order) or literals ('x' | number)
      const tokens = m[3]!.split(',').map((t) => t.trim());
      const row: Record<string, unknown> = { ...(this.defaults.get(table) ?? {}) };
      let paramIdx = 0;
      cols.forEach((c, i) => {
        const tok = tokens[i]!;
        if (tok === '?') {
          row[c] = params[paramIdx++];
        } else if (tok.startsWith("'")) {
          row[c] = tok.slice(1, -1);
        } else if (/^-?\d+(\.\d+)?$/.test(tok)) {
          row[c] = Number(tok);
        } else {
          row[c] = tok;
        }
      });
      const rows = this.tables.get(table) ?? this.tables.set(table, []).get(table)!;
      for (const cols of this.uniques.get(table) ?? []) {
        const dup = rows.find((r) => cols.every((c) => String(r[c]) === String(row[c])));
        if (dup) {
          throw new Error(`InMemoryOfflineStorage: UNIQUE constraint failed: ${table}.${cols.join('+')} = ${cols.map((c) => row[c]).join('/')}`);
        }
      }
      rows.push(row);
      return 1;
    }
    m = /^UPDATE (\w+) SET (.+?) WHERE (\w+) = (\?|'[^']*'|\S+)$/i.exec(s);
    if (m) {
      const table = m[1]!;
      const setCols = this.parseSet(m[2]!, params);
      const whereCol = m[3]!;
      // the WHERE placeholder binds AFTER the SET placeholders — count them,
      // not the SET segments (literals/increments consume no params)
      const setParamCount = setCols.filter((x) => x.kind === 'param').length;
      const whereVal = this.literal(m[4]!, params, setParamCount);
      let n = 0;
      for (const r of this.tables.get(table) ?? []) {
        if (String(r[whereCol]) === String(whereVal)) {
          this.applySet(r, setCols);
          n++;
        }
      }
      return n;
    }
    m = /^UPDATE (\w+) SET (.+)$/i.exec(s);
    if (m) {
      const table = m[1]!;
      const setCols = this.parseSet(m[2]!, params);
      let n = 0;
      for (const r of this.tables.get(table) ?? []) {
        this.applySet(r, setCols);
        n++;
      }
      return n;
    }
    const dm = /^DELETE FROM (\w+) WHERE (\w+) = (\?|'[^']*'|\S+)$/i.exec(s);
    if (dm) {
      const table = dm[1]!;
      const whereCol = dm[2]!;
      const rawWhere = dm[3]!;
      const whereVal = rawWhere === '?' ? params[0] : rawWhere.startsWith("'") ? rawWhere.slice(1, -1) : rawWhere;
      const rows = this.tables.get(table) ?? [];
      const kept = rows.filter((r) => String(r[whereCol]) !== String(whereVal));
      const n = rows.length - kept.length;
      this.tables.set(table, kept);
      return n;
    }
    throw new Error(`InMemoryOfflineStorage: unsupported statement: ${s.slice(0, 80)}`);
  }

  all<T>(sql: string, params: unknown[] = []): T[] {
    const s = sql.trim().replace(/\s+/g, ' ');
    const m = /^SELECT .+? FROM (\w+)(?: WHERE (\w+) = (\?|\S+))?(?: ORDER BY (\w+))?$/i.exec(s);
    if (!m) throw new Error(`InMemoryOfflineStorage: unsupported select: ${s.slice(0, 80)}`);
    const table = m[1]!;
    let rows = [...(this.tables.get(table) ?? [])];
    if (m[2]) {
      const raw = m[3]!;
      const whereVal = raw === '?' ? params[0] : raw.startsWith("'") ? raw.slice(1, -1) : raw;
      rows = rows.filter((r) => String(r[m[2]!]) === String(whereVal));
    }
    if (m[4]) rows.sort((a, b) => String(a[m[4]!]).localeCompare(String(b[m[4]!])));
    return rows.map((r) => ({ ...r })) as T[];
  }

  transaction<T>(fn: () => T): T {
    const snapshot = new Map([...this.tables].map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
    try {
      return fn();
    } catch (err) {
      this.tables.clear();
      for (const [k, v] of snapshot) this.tables.set(k, v);
      throw err;
    }
  }

  /** Parse a SET clause into typed assignments: placeholder, quoted/string
   *  literal, number literal, or `col = col + 1` self-increment. Placeholders
   *  consume params in order. */
  private parseSet(
    setSql: string,
    params: unknown[],
  ): Array<{ col: string; kind: 'param' | 'literal' | 'increment'; value?: unknown }> {
    const out: Array<{ col: string; kind: 'param' | 'literal' | 'increment'; value?: unknown }> = [];
    let paramIdx = 0;
    for (const part of setSql.split(/,\s*/)) {
      const inc = /^(\w+) = (\w+) \+ (\d+)$/.exec(part);
      if (inc) {
        out.push({ col: inc[1]!, kind: 'increment', value: Number(inc[3]!) });
        continue;
      }
      const a = /^(\w+) = (\?|'[^']*'|-?\d+(?:\.\d+)?)$/.exec(part);
      if (!a) throw new Error(`InMemoryOfflineStorage: unsupported SET segment: ${part}`);
      if (a[2] === '?') {
        out.push({ col: a[1]!, kind: 'param', value: params[paramIdx++] });
      } else {
        const raw = a[2]!;
        out.push({ col: a[1]!, kind: 'literal', value: raw.startsWith("'") ? raw.slice(1, -1) : Number(raw) });
      }
    }
    return out;
  }

  private applySet(row: Record<string, unknown>, sets: Array<{ col: string; kind: string; value?: unknown }>): void {
    for (const s of sets) {
      if (s.kind === 'increment') {
        row[s.col] = Number(row[s.col] ?? 0) + Number(s.value ?? 0);
      } else {
        row[s.col] = s.value;
      }
    }
  }

  /** WHERE value: placeholder at the given param index, or a literal
   *  (quoted strings stripped, numbers coerced for comparison). */
  private literal(raw: string, params: unknown[], paramIndex: number): unknown {
    if (raw === '?') return params[paramIndex];
    if (raw.startsWith("'")) return raw.slice(1, -1);
    return raw;
  }
}

/* --------------------------------- schema ---------------------------------- */

/** Local schema DDL — identical on device SQLite and in tests. */
export const OFFLINE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sync_cursor (id INTEGER PRIMARY KEY CHECK (id = 1), cursor TEXT)`,
  `CREATE TABLE IF NOT EXISTS outbox (
     event_id TEXT PRIMARY KEY,
     idempotency_key TEXT NOT NULL UNIQUE,
     type TEXT NOT NULL,
     payload TEXT NOT NULL,
     occurred_at TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',   -- pending | pushing | conflict | rejected
     attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS conflicts (
     event_id TEXT PRIMARY KEY,
     idempotency_key TEXT NOT NULL,
     type TEXT NOT NULL,
     payload TEXT NOT NULL,
     code TEXT NOT NULL,
     message TEXT NOT NULL,
     raised_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS replica_products (
     id TEXT PRIMARY KEY, code TEXT, name TEXT, unit_id TEXT,
     selling_price TEXT, purchase_price TEXT, barcode TEXT, version TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS replica_customers (
     id TEXT PRIMARY KEY, name TEXT, phone TEXT, version TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS local_sales (
     local_id TEXT PRIMARY KEY,              -- client-generated UUID
     outbox_event_id TEXT NOT NULL,          -- atomic pair with the outbox row
     doc_number TEXT,                        -- offline-leased sequence or null
     draft_json TEXT NOT NULL,               -- display copy; server response wins
     captured_at TEXT NOT NULL
   )`,
];

/* ------------------------------ outbox events ------------------------------- */

export type OutboxEventType = 'sale.create' | 'payment.receive' | 'deposit.create' | 'customer.create';

export interface OutboxEventInput {
  eventId: string;
  idempotencyKey: string;
  type: OutboxEventType;
  payload: Record<string, unknown>;
  occurredAt?: string;
}

export interface QueuedEvent {
  eventId: string;
  idempotencyKey: string;
  type: OutboxEventType;
  payload: Record<string, unknown>;
  occurredAt: string;
  status: 'pending' | 'pushing' | 'conflict' | 'rejected';
  attempts: number;
  lastError: string | null;
}

/* ------------------------------ transport layer ----------------------------- */

/** HTTP surface the engine needs — injected so apps bring their own fetch
 *  (with auth headers, pinned certificates, proxy support). */
export interface SyncTransport {
  push(deviceId: string, events: Array<{ eventId: string; idempotencyKey: string; type: string; payload: unknown; occurredAt: string }>): Promise<
    Array<{ eventId: string; status: string; code?: string; message?: string; result?: Record<string, unknown> }>
  >;
  pull(cursor: string | null, limit: number): Promise<{
    entries: Array<{ id: string; type: string; payload: Record<string, unknown>; occurredAt: string }>;
    cursor: string | null;
    hasMore: boolean;
  }>;
}

/* -------------------------------- the engine -------------------------------- */

export interface OfflineEngineOptions {
  deviceId: string;
  storage: OfflineStorage;
  transport: SyncTransport;
  /** push retry policy */
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
  /** jitter fraction 0..1 (deterministic when 0 — chaos sims pin seeds) */
  jitter?: number;
  /** clock for deterministic tests */
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** replica projectors keyed by change-feed event type */
  projectors?: Record<string, (payload: Record<string, unknown>, storage: OfflineStorage) => void>;
}

export interface SyncStatus {
  pending: number;
  conflicts: number;
  rejected: number;
  lastCursor: string | null;
}

export class OfflineEngine {
  private readonly storage: OfflineStorage;
  private readonly transport: SyncTransport;
  private readonly deviceId: string;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly backoffCapMs: number;
  private readonly jitter: number;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly projectors: Record<string, (payload: Record<string, unknown>, storage: OfflineStorage) => void>;

  constructor(opts: OfflineEngineOptions) {
    this.storage = opts.storage;
    this.transport = opts.transport;
    this.deviceId = opts.deviceId;
    this.maxAttempts = opts.maxAttempts ?? 8;
    this.backoffBaseMs = opts.backoffBaseMs ?? 250;
    this.backoffCapMs = opts.backoffCapMs ?? 30_000;
    this.jitter = opts.jitter ?? 0.1;
    this.now = opts.now ?? (() => new Date());
    this.sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    this.projectors = opts.projectors ?? {};
    for (const ddl of OFFLINE_SCHEMA) this.storage.exec(ddl);
  }

  /* ------------------------------ local capture ---------------------------- */

  /** Capture a local sale ATOMICALLY with its outbox event: either both the
   *  local_sales row and the outbox row commit, or neither (offline-sync §4.1).
   *  The draft is a DISPLAY copy — the server's posting result is the truth. */
  captureSale(input: {
    localId: string;
    eventId: string;
    idempotencyKey: string;
    docNumber: string | null;
    draft: Record<string, unknown>;
  }): void {
    this.storage.transaction(() => {
      this.storage.exec(
        `INSERT INTO local_sales (local_id, outbox_event_id, doc_number, draft_json, captured_at)
         VALUES (?, ?, ?, ?, ?)`,
        [input.localId, input.eventId, input.docNumber, JSON.stringify(input.draft), this.now().toISOString()],
      );
      this.storage.exec(
        `INSERT INTO outbox (event_id, idempotency_key, type, payload, occurred_at, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [input.eventId, input.idempotencyKey, 'sale.create', JSON.stringify(input.draft), this.now().toISOString()],
      );
    });
  }

  /** Generic queue for other event types (payment/deposit/customer). */
  enqueue(event: OutboxEventInput): void {
    this.storage.exec(
      `INSERT INTO outbox (event_id, idempotency_key, type, payload, occurred_at, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [event.eventId, event.idempotencyKey, event.type, JSON.stringify(event.payload), event.occurredAt ?? this.now().toISOString()],
    );
  }

  /* --------------------------------- push ---------------------------------- */

  /** Push pending events in FIFO order (a single document's atomic group is
   *  one event). Idempotent: the server dedupes by eventId/idempotencyKey;
   *  conflicts move to the explicit conflict queue, never dropped (§5). */
  async pushAll(onProgress?: (ev: QueuedEvent) => void): Promise<{ pushed: number; conflicts: number; rejected: number }> {
    const pending = this.listOutbox(['pending']);
    let pushed = 0;
    let conflicts = 0;
    let rejected = 0;
    for (const ev of pending) {
      let outcome: { status: string; code?: string; message?: string } | null = null;
      let lastError: string | null = null;
      for (let attempt = ev.attempts; attempt < this.maxAttempts && !outcome; attempt++) {
        this.storage.exec(`UPDATE outbox SET status = 'pushing', attempts = attempts + 1 WHERE event_id = ?`, [ev.eventId]);
        try {
          const [res] = await this.transport.push(this.deviceId, [
            { eventId: ev.eventId, idempotencyKey: ev.idempotencyKey, type: ev.type, payload: ev.payload, occurredAt: ev.occurredAt },
          ]);
          if (res && (res.status === 'applied' || res.status === 'duplicate')) {
            outcome = res;
          } else if (res && (res.status === 'conflict' || res.status === 'rejected')) {
            outcome = res; // terminal — human resolution, no retry storm
          } else {
            lastError = res ? `unexpected outcome ${res.status}` : 'no outcome';
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
        if (!outcome) {
          // transient failure: backoff + jitter, then requeue as pending
          this.storage.exec(`UPDATE outbox SET status = 'pending', last_error = ? WHERE event_id = ?`, [lastError, ev.eventId]);
          if (attempt + 1 < this.maxAttempts) {
            const exp = Math.min(this.backoffCapMs, this.backoffBaseMs * 2 ** attempt);
            const j = this.jitter * exp * (Math.random() * 2 - 1);
            await this.sleep(Math.max(0, exp + j));
          }
        }
      }
      if (!outcome) {
        this.storage.exec(`UPDATE outbox SET status = 'rejected', last_error = ? WHERE event_id = ?`, [
          lastError ?? `exhausted ${this.maxAttempts} attempts`,
          ev.eventId,
        ]);
        rejected++;
        continue;
      }
      if (outcome.status === 'conflict' || outcome.status === 'rejected') {
        // explicit review queue with full context (§5b — never silent)
        this.storage.transaction(() => {
          this.storage.exec(
            `INSERT INTO conflicts (event_id, idempotency_key, type, payload, code, message, raised_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [ev.eventId, ev.idempotencyKey, ev.type, JSON.stringify(ev.payload), outcome!.code ?? outcome!.status, outcome!.message ?? '', this.now().toISOString()],
          );
          this.storage.exec(`DELETE FROM outbox WHERE event_id = ?`, [ev.eventId]);
        });
        if (outcome.status === 'conflict') conflicts++;
        else rejected++;
      } else {
        this.storage.exec(`DELETE FROM outbox WHERE event_id = ?`, [ev.eventId]);
        pushed++;
      }
      onProgress?.(ev);
    }
    return { pushed, conflicts, rejected };
  }

  /* --------------------------------- pull ---------------------------------- */

  /** Resumable pull: pages the change feed, checkpoints the cursor after
   *  EVERY page (crash-safe), projects entries into the local replica. */
  async pullAll(maxPages = 50): Promise<{ entries: number; cursor: string | null }> {
    let total = 0;
    for (let page = 0; page < maxPages; page++) {
      const cursor = this.getCursor();
      const res = await this.transport.pull(cursor, 200);
      for (const entry of res.entries) {
        const project = this.projectors[entry.type];
        if (project) this.storage.transaction(() => project(entry.payload, this.storage));
        total++;
      }
      // checkpoint after each page — a crash repeats at most one page (idempotent projectors)
      this.setCursor(res.cursor);
      if (!res.hasMore) break;
    }
    return { entries: total, cursor: this.getCursor() };
  }

  /* -------------------------------- queries -------------------------------- */

  listOutbox(statusFilter?: QueuedEvent['status'][]): QueuedEvent[] {
    const rows = this.storage.all<{
      event_id: string; idempotency_key: string; type: string; payload: string;
      occurred_at: string; status: string; attempts: number; last_error: string | null;
    }>(`SELECT * FROM outbox ORDER BY occurred_at`);
    return rows
      .filter((r) => !statusFilter || statusFilter.includes(r.status as QueuedEvent['status']))
      .map((r) => ({
        eventId: r.event_id,
        idempotencyKey: r.idempotency_key,
        type: r.type as OutboxEventType,
        payload: JSON.parse(r.payload) as Record<string, unknown>,
        occurredAt: r.occurred_at,
        status: r.status as QueuedEvent['status'],
        attempts: r.attempts,
        lastError: r.last_error,
      }));
  }

  listConflicts(): Array<{ eventId: string; code: string; message: string; payload: Record<string, unknown>; raisedAt: string }> {
    return this.storage
      .all<{ event_id: string; code: string; message: string; payload: string; raised_at: string }>(
        `SELECT * FROM conflicts ORDER BY raised_at`,
      )
      .map((r) => ({
        eventId: r.event_id,
        code: r.code,
        message: r.message,
        payload: JSON.parse(r.payload) as Record<string, unknown>,
        raisedAt: r.raised_at,
      }));
  }

  /** Resolve a conflict by DISCARDING it (the operator re-captures a corrected
   *  document — financial conflicts are never auto-reapplied). */
  discardConflict(eventId: string): void {
    this.storage.exec(`DELETE FROM conflicts WHERE event_id = ?`, [eventId]);
  }

  status(): SyncStatus {
    const all = this.listOutbox();
    const pending = all.filter((e) => e.status === 'pending' || e.status === 'pushing').length;
    const rejected = all.filter((e) => e.status === 'rejected').length;
    const conflicts = this.listConflicts().length;
    return { pending, conflicts, rejected, lastCursor: this.getCursor() };
  }

  private getCursor(): string | null {
    const rows = this.storage.all<{ cursor: string | null }>(`SELECT cursor FROM sync_cursor WHERE id = 1`);
    return rows[0]?.cursor ?? null;
  }

  private setCursor(cursor: string | null): void {
    this.storage.transaction(() => {
      this.storage.exec(`DELETE FROM sync_cursor WHERE id = 1`);
      if (cursor !== null) {
        this.storage.exec(`INSERT INTO sync_cursor (id, cursor) VALUES (1, ?)`, [cursor]);
      }
    });
  }
}
