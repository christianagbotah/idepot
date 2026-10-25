# Offline-First and Synchronization Design

Implements master prompt §9. Offline-first is a hard requirement: Ghana depots routinely lose connectivity; the legacy web app simply dies when the link drops.

## 1. Principle

A cashier must be able to **complete, print and locally commit** a sale with zero network. Correctness of money/stock is guaranteed locally by the same domain code (`packages/domain`) that the server runs; the server remains authoritative once synced.

## 2. Local stores

| Platform | Store | Contents |
|---|---|---|
| Tauri desktop | SQLite via `tauri-plugin-sql` | Operational replica scoped to user's branch: products, prices, units, customers, open docs, sequences lease, recent transactions, ledgers for offline reporting |
| React Native | SQLite (expo-sqlite / op-sqlite) | Same scoped replica + field-sales data |
| Web PWA | IndexedDB (Dexie) + service worker | Read cache + **outbox queue** for POS-critical web workflows only (sale submission, payment capture); full offline DB deliberately not mirrored in browser |

Only data the signed-in user is authorized to hold is cached (tenant + branch scope enforced at pull time and on device at rest — encrypted SQLite where the OS supports it).

## 3. Identity strategy

- **UUIDv7** for all entity ids — client-generatable, index-friendly, collision-safe without coordination.
- Human-readable document numbers (SO/INV/WBN/RCT) come from the server's `document_sequence` — **offline devices lease ranges** (e.g. 100 invoice numbers per terminal per day, with branch+device tag) so a terminal can number offline sales without collisions; lease reconciliation happens at sync.
- Pre-printed booklet mode: booklet ranges are imported server-side and leased to branches exactly like sequences.

## 4. Sync protocol (deterministic)

### Push (outbox)
1. Every local mutation writes an **outbox event** in the same SQLite transaction as the data (transactional outbox on-device).
2. Events carry: `event_id (UUIDv7)`, `idempotency_key`, `device_id`, `entity`, `op`, payload, `base_version` (of every referenced aggregate), `occurred_at`.
3. Push is dependency-ordered per document (customer → order → lines → payment → allocation), batched, retried with exponential backoff + jitter.
4. Server applies each event **idempotently** (dedupe by `event_id`/`idempotency_key`) inside one PG transaction per event (or per declared atomic group).
5. Server responds per event: `applied` (with new server version), `conflict` (policy below), or `rejected` (validation).

### Pull (inbox / change feed)
1. `change_feed` table on server: monotonic `seq` per tenant, entity, row version, scope (branch), tombstones for hard-deletable data (master data only).
2. Devices keep `sync_cursor`; pull is resumable (`seq > cursor`, paged, checkpointed).
3. Pull applies via last-writer-server-wins for **reference data** (products, prices, customers) — server is authoritative for these; local uncommitted edits to reference data are rare and routed through approval.

## 5. Conflict policies (per entity class — never silent LWW for money)

| Entity class | Policy |
|---|---|
| Sales orders / invoices (created offline) | **Append-only create** — no conflict possible; duplicate protection by idempotency key |
| Payments / allocations | Append-only create; allocation re-validation server-side; if invoice was settled meanwhile → allocation conflict → goes to **allocation review queue** (accountant resolves; no auto-rewrite) |
| Stock movements | Append-only; on-hand conflicts resolved by ledger arithmetic (movements always apply); negative-result guard flags for policy check |
| Fulfillments / waybills | Append-only; waybill lease conflicts surface as exceptions |
| Document edits / voids | Offline-initiated voids are requests; server validates state transition; rejection → user task list |
| Reference data (products, prices, customers) | Server-wins for field updates; offline-created customers sync as creates with dedupe (phone-based suggestion) |
| Cashier shifts | Append-only events (open, cash-in/out, close, count); variance approval online |

**Rule:** financial conflicts are never silently resolved; they create explicit review tasks with full context (master prompt §9).

## 6. Sequencing & causality

- Pull before push at session start (fresh reference data reduces validation rejects).
- Push ordering enforced by the outbox dependency graph; atomic groups (order + lines + payment) pushed as one unit and applied in one server transaction.
- Device clock skew tolerated: `occurred_at` recorded but server `received_at` authoritative for reporting; business dates captured explicitly at entry.

## 7. Sync state UX (master prompt §9)

Persistent indicator: **Online / Syncing k pending / Offline (n queued since hh:mm) / Attention (m failures)**. Last successful sync timestamp always visible. Failure list with reasons and safe retry. Sync never blocks POS interaction; runs in background with backoff, on app start, and on connectivity event.

## 8. Server-side change feed

- Transactional outbox table → relay worker → `change_feed` (assigns tenant-scoped monotonic seq). Reporting/AI jobs consume the same outbox.
- Compaction: change_feed rows older than N days and below all device cursors are archived (tombstones retained longer for deletable master data).

## 9. Offline POS UX requirements (from audit of legacy behaviour to preserve)

- Barcode scan focus/add without mouse; product search by name/SKU/barcode (local index);
- guest/cash customer by policy; customer quick-create (phone-first, dedupe later);
- quantity/unit/price fast edit with permissioned discount;
- split tenders; change due prominent; hold/resume sale;
- receipt prints immediately after local commit (thermal via hardware bridge; web PWA prints queued or via paired desktop);
- offline state unmistakable but non-disruptive;
- sale statuses derived locally by the shared domain code (same ladder as server — corrected ladder incl. overpaid).

## 10. Testing strategy for sync

- Property tests: N clients × M events random ordering → convergence, zero duplication, ledger invariants hold.
- Chaos: kill mid-push, duplicate delivery, clock skew, lease exhaustion, reconnect storms.
- E2E: offline sale → reconnect → idempotent sync; concurrent offline sale + online payment on same invoice → conflict queue.
- Load: 50 terminals × 8h shifts × bursts (the legacy `stock_manager` at 842k rows shows the write volume scale to design for).

## 11. Redis/queues note

Redis is used only server-side (outbox relay, notifications, AI jobs, report generation) and is **not** required for a POS sale to commit — either online (direct PG transaction) or offline (local commit). On-premise deployments can run without Redis by using PG-based polling for the relay.
