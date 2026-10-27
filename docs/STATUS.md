# iDepot Modernization — Status Board

| | |
|---|---|
| **Current phase** | Phase 1 — monorepo foundation + migration engineering foundation (this branch) |
| **Previous phase** | Phase 0 — forensic audit & architecture ✅ (merged to main) |
| **Branch** | `phase-1/monorepo-foundation` |
| **Repo state** | Phase 1 implementation: ADRs, monorepo, API, migration engine, tests, CI |

## Completed capabilities (Phase 1)

**ADR gate (before dependent production code, per ROADMAP):**
- **ADR-0001** Posting Coordinator / Unit-of-Work: application transaction context + AsyncLocalStorage propagation + repository-layer enforcement (`NoActiveTransactionError`); HTTP interceptors never manage transactions; audit + outbox are in-transaction participants. Reference implementation + all-or-nothing rollback test.
- **ADR-0002** Database access/ORM: **PostgreSQL + TypeORM 0.3 (primary ORM) over a pg base layer; Kysely approved for typed reporting SQL; COPY (`pg-copy-streams`) for migration bulk loads.** Decision backed by measured benchmark (B1–B7, 3 candidates, all PASS; evidence in `docs/adr/evidence/orm-bench-latest.json`): B5 bulk 50k rows — kysely 128k rows/s, typeorm 57k rows/s, raw COPY 45k rows/s (2-CPU sandbox); numeric(18,4) exact in all paths; migrations require owner connection (measured, enforced).
- **ADR-0003** Multi-tenancy/RLS: shared schema, `tenant_id` everywhere, transaction-scoped `SET LOCAL app.tenant_id` (fail-closed), app role least-privilege (no TRUNCATE/CREATE — enforced by tests), tenant-scoped unique constraints, on-prem = same schema one tenant.

**Monorepo & tooling:**
- npm workspaces: `packages/{config,domain,contracts,auth,migration,testing,ui}`, `apps/{api,web}`, `benchmarks/orm-bench`; topological build driver; strict TS base; ESLint flat config with **enforced module boundaries** (domain framework-free; api cannot import migration internals; web cannot import DB drivers).
- Embedded PostgreSQL test harness (random port, admin/app role split, external-server + no-self-boot modes).
- Checksum-verified idempotent SQL migration runner (`infra/migrations`) — migrations are immutable once applied.

**apps/api (NestJS 11) — vertical slice live:**
- AuthN: Argon2id (64 MiB/t3/p4), HS256 access/refresh with type separation, device registry, tenant-slug login (RLS-consistent tenant resolution via admin pool).
- AuthZ: global JwtAuthGuard + RbacGuard with permission catalog (`owner/admin/manager/cashier/auditor`), authorization-matrix tests.
- Tenancy: JWT-bound tenant context, RLS policies on all tenant-owned tables, tenant-scoped uniques; cross-tenant access impossibility proven by tests (404 semantics both read & write).
- Posting Coordinator: `UnitOfWork.run()` — document + audit + outbox commit in ONE transaction; injected-failure test proves **zero partial rows**; repository write outside UoW is structurally impossible.
- Transactional outbox + change-feed primitives (`GET /internal/change-feed`, `POST /internal/change-feed/ack`) — projection-only consumers.
- Audit events written inside the posting transaction for every mutating action.

**Migration engineering foundation (`packages/migration`):**
- `legacy_raw` ownership contract: schema+tables created ONLY by the DDL layer (`0002_migration_workstream.sql`); the runtime stager **fails fast** if absent — never issues CREATE SCHEMA/TABLE (tested).
- Pipeline: legacy dump → isolated staging MySQL (non-strict import reproducing legacy semantics) → verbatim `legacy_raw` (all-TEXT, COPY FROM STDIN, `_src_row_number`) → sha256 checksums staging↔raw (must match) → validators (encoding/mojibake, date parsability, orphan FKs, D1 split-receipt signature, code census) → quarantine WITH reasons (never silent drops) → transform (`store`→`warehouse`) via `legacy_id_map` (idempotent) → **correction-aware reconciliation** → `reconciliation.json` + human report + `migration_run` registry.
- **D1 handled from day one**: receipt-total multiplication detected (`Σ payment rows = N × tender`); reconstructed from the invoice-amount authority; records carry `legacy_stored_value`, `legacy_reconstructed_value`, `new_system_value` (per-payment allocation model), `correction_delta`, `correction_reason`, evidence citing `Admin.php:17270-17438`, severity `critical`, `requires_manual_approval=true`. No silent repair anywhere.
- Synthetic fixture (no PII) exercising: clean imports, double-encoded text, zero-date row, orphan FK, D1 split receipt (2 invoices, stored 100/100 vs reconstructed 40/60).
- CLI: `idepot-migrate smoke` (end-to-end; MySQL protocol primary, documented parsed-dump fallback).

**apps/web:** Next.js 15 shell with `@idepot/ui` design tokens and a login scaffold wired to the API contract.

**CI (`.github/workflows/ci.yml`):** two jobs. `verify`: postgres:16 + mysql:8 services; lint → **clean typecheck (regression-gated: all `dist/` deleted first, source-path resolution)** → build → unit → integration (RLS/RBAC/coordinator/migration smoke) → CLI migration smoke with `reconciliation.json` artifact upload. `security`: gitleaks secret scanning (pinned v8.30.1, checksum-verified, full history, `.gitleaks.toml` policy) + dependency audits (runtime chains fail on high/critical; all chains fail on critical) — policy and triage in `docs/security/dependency-audit.md`.

## Test status (this branch — re-verified after clean-checkout fixes, 2026-10-27)

| Suite | Result |
|---|---|
| Unit (auth: Argon2id, RBAC decision, JWT types) | 4/4 (vitest 4.1.12) |
| Infra migrations + RLS + least-privilege | 5/5 |
| Posting Coordinator atomicity + enforcement | 3/3 |
| RBAC matrix + cross-tenant impossibility | 26/26 |
| Vertical slice E2E (login→tenant→CRUD→audit→change-feed→ack→devices) | 7/7 |
| Migration smoke + idempotency + ownership contract | 7/7 |
| ORM benchmark (3 candidates × B1–B7) | 21/21 PASS (committed evidence, unchanged) |
| CLI end-to-end smoke (fixture → legacy_raw → reconciliation.json) | PASS ×2 runs (idempotent: second run imported=0, reused=3) |
| Lint / **clean** typecheck (no dist) / build | clean (9 workspaces) |
| npm audit (runtime + full) | 0 vulnerabilities |
| gitleaks full-history secret scan | clean (2 documented allowlist entries) |

## Exit criteria check (ROADMAP Phase 1)

- [x] auth+RBAC enforced on a sample CRUD resource with matrix tests green, **including cross-tenant access impossibility** (26/26)
- [x] **CI green.** GitHub Actions run `40437576011` (PR #2 head `f714cbd`) succeeded through every step in both jobs on a clean runner: install → lint → typecheck (clean — no stale dist) → build → unit → integration (embedded PG + RLS + RBAC + coordinator) → migrations → MySQL→legacy_raw smoke → `reconciliation.json` artifact uploaded; security job green (gitleaks full-history scan, runtime + full dependency audits). History: run `40376824450` (head `217e67d`) failed at Typecheck — a clean checkout has no `dist/`, so workspace-internal packages were unresolvable; fixed by source-path typecheck configs (`tsconfig.typecheck.json` per workspace), corrected `types` → `*.d.ts` package metadata, the `npm run typecheck:clean` regression gate, dependency/security scanning gates, and remediating all 8 npm-audit findings (`9aa8d24`, see `docs/security/dependency-audit.md`). Run `40436100540` (head `9aa8d24`) then failed at Integration tests — the embedded-PG scratch directory defaulted to a hardcoded development-sandbox absolute path, uncreatable on the runner; fixed by resolving it at runtime from the monorepo root (`f714cbd`).
- [x] posting-coordinator reference test proves **all-or-nothing rollback** (failure injected after partial writes → zero rows)
- [x] migration smoke runs a fixture dump end-to-end and emits `reconciliation.json` (CLI + vitest + CI step)
- [x] ADR-0001..0003 approved **before** their dependent production code (commit order in history)

## Known limitations / deferred (deliberate)

- Migration workstream Phase 1 imports only `store`→`warehouse`; `item`/`invoice`/`payment` are staged, validated, quarantined and reconciled but not imported (their targets arrive in Phases 2–3 per the continuous-migration plan).
- Reconstruction for D1 uses the invoice-amount authority (defect-register remediation rule); invoice-level manual sign-off workflow (approval UI) lands with Phase 3 migration workstream — records are stored and flagged now.
- Outbox projector is a primitive (read + ack endpoints); scheduled background dispatcher arrives with the first real consumer.
- CI uses service containers for MySQL/PostgreSQL; the current sandbox has no MySQL server, so local smoke verification uses the documented parsed-dump fallback source — CI exercises the MySQL protocol path (mysql:8 service).
- Web is a shell + design baseline only (no session persistence yet).

## Next actions (Phase 2)

1. Master data & inventory domain (products/categories/units/price lists) + stock ledger with posting participants registered with the coordinator.
2. Migration workstream: import products/categories/units/customers/suppliers/locations; opening stock count-first authority.
3. Invariant tests (`balance ≡ Σ movements`, conversion conservation) on fixture data.
4. Outbox background projector + first real projection (read-model refresh).
