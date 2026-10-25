# Offline-First and Synchronization Design

Implements master prompt §9. Offline-first is a hard requirement: Ghana depots routinely lose connectivity; the legacy web app simply dies when the link drops.

## 1. Principle

A cashier must be able to **complete, print and locally commit** a sale with zero network. Correctness of money/stock math is guaranteed locally by the same domain code (`packages/domain`) that the server runs; the server remains authoritative once synced. A local commit is **locally** correct and complete (§5a); **global/authoritative correctness** — stock availability, credit limits, period state — can only be established at synchronization (§5b).

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
4. Server applies each event **idempotently** (dedupe by `event_id`/`idempotency_key`) inside one PG transaction per event (or per declared atomic group). The apply path is the **same Posting Coordinator** used by online commands ([target-architecture.md](target-architecture.md) §4): journal entry, stock/COGS movements, allocations, subledger impacts, tax lines and the audit event commit in that same transaction. **Synchronization never bypasses or defers financial posting** — a synced document that cannot post completely (e.g. unbalanced journal) is rejected as a whole and returned to the device for correction; it is never partially applied and never parked for a background worker.
5. Server responds per event: `applied` (with new server version), `conflict` (policy below), or `rejected` (validation).

### Pull (inbox / change feed)
1. `change_feed` table on server: monotonic `seq` per tenant, entity, row version, scope (branch), tombstones for hard-deletable data (master data only).
2. Devices keep `sync_cursor`; pull is resumable (`seq > cursor`, paged, checkpointed).
3. Pull applies via last-writer-server-wins for **reference data** (products, prices, customers) — server is authoritative for these; local uncommitted edits to reference data are rare and routed through approval.

## 5. Conflict policies (per entity class — never silent LWW for money)

| Entity class | Policy |
|---|---|
| Sales orders / invoices (created offline) | **Append-only create** — duplicate *identity* is impossible (UUIDv7 + idempotency key), but disconnected devices can still create **business conflicts** (stock, credit limits, reference-data state, period close, leases, scopes) → explicit policies in §5b |
| Payments / allocations | Append-only create; allocation re-validation server-side; if invoice was settled meanwhile → allocation conflict → goes to **allocation review queue** (accountant resolves; no auto-rewrite) |
| Stock movements | Append-only; on-hand conflicts resolved by ledger arithmetic (movements always apply); negative-result guard flags for policy check |
| Fulfillments / waybills | Append-only; waybill lease conflicts surface as exceptions |
| Document edits / voids | Offline-initiated voids are requests; server validates state transition; rejection → user task list |
| Reference data (products, prices, customers) | Server-wins for field updates; offline-created customers sync as creates with dedupe (phone-based suggestion) |
| Cashier shifts | Append-only events (open, cash-in/out, close, count); variance approval online |

### 5a. Local correctness vs global correctness

**A. Local correctness — what the offline device guarantees for every locally committed document:**

- correct math (totals, tax, change — computed by the shared server-grade domain code);
- a balanced local financial representation;
- valid units/conversions;
- a complete local atomic document (header + lines + tender + allocation committed in one SQLite transaction);
- valid local permissions according to the device's **signed authorization snapshot** (valid as of the last sync);
- idempotent identity (UUIDv7 + idempotency key — duplicate identity collisions impossible).

**B. Global/authoritative correctness — can only be established at synchronization**, against current server state. UUID/idempotency keys prevent duplicate *identity*; they do not prevent *business* conflicts, e.g.:

- two terminals sell the last available stock while both are offline;
- a customer's credit limit is consumed by another terminal;
- a price or product is disabled while another device is offline;
- an accounting period is closed before the device reconnects;
- a document-number lease or an authorization scope changes while the device is offline.

### 5b. Sync policies for business conflicts

- **Stock — concurrent offline oversell:** the server **never silently rewrites the sale**. A configurable policy determines the outcome:
  1. *Allow as negative/backorder* — the synced sale posts, on-hand goes negative (or a backorder document is created), and a **prominent exception + reconciliation task** is raised; or
  2. *Exception state* — the synced transaction enters an **explicit review/exception state** for supervisor resolution before it becomes financially effective.
- **Hard stock limits (optional):** businesses requiring strict availability may issue **stock/quantity leases (offline allocation quotas) to devices while connected**. Documented limitation: fully disconnected operation cannot mathematically guarantee global on-hand availability across multiple terminals without previously leased capacity.
- **Customer credit-limit conflicts, period-close conflicts, revoked permissions, changed scopes/leases:** surfaced on sync as **explicit review/rejection workflows** with full context — never silently resolved, never silently applied with stale authorization.

**Rule:** financial conflicts are never silently resolved; they create explicit review tasks with full context (master prompt §9).

## 6. Sequencing & causality

- Pull before push at session start (fresh reference data reduces validation rejects).
- Push ordering enforced by the outbox dependency graph; atomic groups (order + lines + payment) pushed as one unit and applied in one server transaction.
- Device clock skew tolerated: `occurred_at` recorded but server `received_at` authoritative for reporting; business dates captured explicitly at entry.

## 7. Sync state UX (master prompt §9)

Persistent indicator: **Online / Syncing k pending / Offline (n queued since hh:mm) / Attention (m failures)**. Last successful sync timestamp always visible. Failure list with reasons and safe retry. Sync never blocks POS interaction; runs in background with backoff, on app start, and on connectivity event.

## 8. Server-side change feed

- Transactional outbox table → relay worker → `change_feed` (assigns tenant-scoped monotonic seq). The outbox carries events **describing committed facts** — financial (`InvoicePosted`, `PaymentReceived`, `CreditNotePosted`, `StockMoved`, `PurchaseReceived`, `RefundPosted`) and non-financial alike. Consumers (notifications, reporting/read-model refresh, search indexing, analytics, AI, webhooks, and the device sync feed via `change_feed`) only **project** those facts; no consumer performs financially authoritative posting — those consequences committed synchronously inside the posting transaction before the event became visible ([target-architecture.md](target-architecture.md) §4.2–4.3).
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
- E2E: offline sale → reconnect → idempotent sync; concurrent offline sale + online payment on same invoice → conflict queue; **two offline terminals oversell the last stock → policy-driven outcome (backorder + exception task, or review/exception state)**; offline sale exceeding credit limit / into a since-closed period / with since-revoked permission → explicit review or rejection, never silent application.
- Load: 50 terminals × 8h shifts × bursts (the legacy `stock_manager` at 842k rows shows the write volume scale to design for).

## 11. Redis/queues note

Redis is used only server-side for outbox consumers (notifications, AI jobs, report/read-model refresh, search, webhooks — all **projection-only**, never financially authoritative posting) and is **not** required for a POS sale to commit — either online (direct PG transaction via the Posting Coordinator) or offline (local commit). Financial posting requires only PostgreSQL. On-premise deployments can run without Redis by using PG-based polling for the relay.
