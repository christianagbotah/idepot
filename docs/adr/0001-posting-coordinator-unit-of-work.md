# ADR-0001 — Posting Coordinator / Unit-of-Work enforcement mechanics

- **Status:** Accepted (Phase 1)
- **Date:** 2026-10-26
- **Deciders:** Phase 1 engineering
- **Scope:** All financially coupled writes, every entry point (HTTP commands, CLI migration runs, sync workers, internal service calls).

## Context

The Phase 0 architecture (target-architecture.md §3/§4) requires that every financially
coupled operation — business document, stock/COGS movement, tender, allocation, subledger
impact, tax lines, GL journal entry, audit event, outbox row — commits in **one PostgreSQL
transaction**. Partial persistence is the exact defect class that corrupted the legacy
system (D4: zero `trans_start` usage; D1: multi-statement autocommit posting).

The ROADMAP ADR gate requires a decision on **how** the single-transaction guarantee is
enforced before dependent production code is written, and explicitly notes that a NestJS
HTTP interceptor alone is insufficient: CLI migration runs, sync workers and internal
service-to-service calls must carry the same guarantee.

## Decision

1. **Application transaction context (UnitOfWork).** All writes that participate in a
   posting set execute inside `UnitOfWork.run({ tenantId, userId }, work)`. The UnitOfWork:
   - acquires one dedicated `pg.Client` from the pool;
   - `BEGIN`s and sets transaction-local session context:
     `SET LOCAL app.tenant_id`, `SET LOCAL app.user_id` (feeding RLS + audit triggers);
   - executes `work` with a context object exposing the transaction-scoped query executor,
     an **audit participant** and an **outbox participant** (both write rows inside the same
     transaction);
   - `COMMIT`s on success, `ROLLBACK`s and rethrows on any failure (all-or-nothing).
2. **AsyncLocalStorage propagation.** The active transaction context is propagated via
   `AsyncLocalStorage`, so deeply nested services resolve the current transaction without
   threading a parameter through every call — while explicit passing remains supported and
   preferred at service boundaries.
3. **Repository-layer enforcement.** Repositories resolve their executor from the active
   UnitOfWork. A write executed **without** an active UnitOfWork throws
   `NoActiveTransactionError` — the write path is structurally incapable of autocommit.
   Reads outside a UoW use the pool directly and are RLS-safe (no session context ⇒ 0 rows).
4. **HTTP interceptor scope.** The NestJS interceptor performs logging/observability only.
   It does **not** open or manage transactions. Command services open their own UoW, which
   is why CLI tools (migration importer posts target records through the same coordinator)
   and future sync workers get identical semantics.
5. **Outbox semantics (per Phase 0 correction).** Outbox rows may represent committed
   financial facts (`WarehouseImported` in Phase 1; `InvoicePosted`, `PaymentReceived`, …
   later). Async consumers may only **project**; no async consumer performs financially
   authoritative posting.

## Consequences

- Every write path is provably transactional; the atomicity reference test
  (posting-coordinator.integration.test) injects a failure mid-posting and asserts **zero**
  persisted rows across document + audit + outbox.
- Transaction lifetime is explicit; long-running external calls inside a UoW are a code
  smell detected in review (single-transaction guard = no HTTP/IO inside `work`).
- `SET LOCAL` session context requires all RLS-subject writes to go through the UoW —
  which is exactly the enforcement we want (verified by RLS tests: no context ⇒ no rows).
- Testing uses the same UoW against the embedded PostgreSQL, so CI proves the real path.

## Alternatives considered

- **HTTP interceptor transaction wrapper** — rejected: blind to CLI/worker/internal calls;
  encourages controllers to know transaction policy; Phase 0 ADR gate pre-rejected it.
- **Per-repository transactions** — rejected: no single posting boundary; the D1/D4 class
  of legacy corruption becomes possible again.
- **Stored procedures as posting boundary** — rejected: business logic escapes the
  application domain layer, hurts testability and versioning; kept as a possible future
  optimization for hot paths only, never as the coordinator.
