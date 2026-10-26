# ADR-0002 — Database access layer / ORM choice

- **Status:** Accepted (Phase 1)
- **Date:** 2026-10-26
- **Deciders:** Phase 1 engineering
- **Evidence:** [orm-bench-latest.json](evidence/orm-bench-latest.json) (full results, 3 candidates × 7 dimensions, all PASS); harness: `benchmarks/orm-bench/`.

## Context

Phase 1 requires a database access decision benchmarked — not chosen on CRUD convenience
— across: transaction propagation across modules; PostgreSQL `numeric` handling; raw/typed
SQL for ledger paths; migrations; bulk migration performance (10⁵–10⁶ rows/client); RLS /
session context; testability (ROADMAP ADR gate).

Workload shape: OLTP financial documents (strict numeric semantics, single-transaction
posting sets), migration bulk loads (COPY-scale), reporting queries (window functions),
multi-tenant RLS everywhere.

## Candidates benchmarked

| Candidate | Role in bench |
|---|---|
| `raw-pg` (node-postgres + pg-copy-streams) | control / baseline |
| `typeorm 0.3` | full-ORM candidate |
| `kysely 0.28` | typed query-builder candidate |

(Drizzle and Prisma 7 were considered and narrowed out before benchmarking: Prisma 7's
driver-adapter + generated-client model pushes against the explicit per-transaction
`SET LOCAL` RLS requirement and adds a codegen step to every schema change; Drizzle's
migration tooling story was strictly weaker than the two candidates measured on the same
dimensions. Re-evaluation can be triggered by a new bench run — the harness is committed.)

## Measured results (embedded PostgreSQL 18.4, app-role connections, 2026-10-26)

| Dimension | raw-pg | typeorm | kysely |
|---|---|---|---|
| B1 propagation + atomic rollback | PASS (9ms) | PASS (5ms) | PASS (10ms) |
| B2 numeric(18,4) exact | PASS | PASS | PASS |
| B3 raw ledger SQL + window fn | PASS | PASS | PASS |
| B4 migration facility | PASS (checksum runner) | PASS (owner-connection migrations) | PASS |
| B5 bulk 50k rows | PASS 45,135 rows/s (COPY) | PASS 56,739 rows/s (chunked INSERT) | PASS 128,009 rows/s (chunked INSERT) |
| B6 RLS via session context | PASS | PASS | PASS |
| B7 SQL observability | PASS (by construction) | PASS (80 stmts captured) | PASS (78 queries captured) |

Notes that materially informed the decision:

- **Migrations need owner privileges.** TypeORM's migration executor creates its
  bookkeeping table and requires DDL — under the least-privilege app role this correctly
  fails (`permission denied for schema public`). This matches the Phase 1 topology
  (migrations run as admin via `infra/migrations`, runtime connects as `idepot_app`).
- **numeric(18,4) is exact in all three** when mapped as string end-to-end.
- **Kysely is the throughput leader** for chunked inserts; **raw COPY remains the
  migration-layer bulk path** (streaming, no ORM object materialization).

## Decision

1. **PostgreSQL is the sole datastore** (version pinned in deployment docs; tests run
   embedded 18.4 — the harness is the contract).
2. **TypeORM 0.3 is the primary ORM** for transactional domain persistence (entities,
   relations in Phase 2+): explicit `EntityManager` propagation fits ADR-0001's UnitOfWork,
   numeric-as-string is exact, migration tooling exists but **schema ownership stays with
   our checksum-verified SQL runner** (`infra/migrations`) — TypeORM schema-sync is
   disabled, and TypeORM migrations (if any) always run under an owner connection.
3. **node-postgres stays the base layer**: the UnitOfWork acquires dedicated `Client`s;
   the migration engine bulk-loads via `COPY FROM STDIN` (`pg-copy-streams`).
4. **Kysely is approved for typed reporting/read-model SQL** where query-builder
   composition beats string SQL; not used for posting paths.
5. **No ORM auto-migrations in production.** All schema changes go through
   `infra/migrations/*.sql` (checksum-verified, applied by the migration runner as admin).

## Consequences

- The Posting Coordinator (ADR-0001) is implemented over the pg layer directly; TypeORM
  repositories resolve the UoW's executor via AsyncLocalStorage.
- Bulk import performance is a solved, measured concern (≥45k rows/s on a 2-CPU sandbox
  for all three paths; production cutover uses COPY at the migration layer).
- A new candidate (Prisma/Drizzle or a TypeORM major) requires re-running
  `benchmarks/orm-bench` and updating this ADR — the harness makes that cheap.
