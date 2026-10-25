# Target Architecture — Monorepo, Stack and Boundaries

Implements master prompt §4. Decisions are recorded with rationale; deviations require an ADR.

## 1. Shape: modular monolith + separate AI service

```text
apps/
  web/        Next.js 15+ (App Router) PWA portal — admin/back-office, dashboards, reports
  api/        NestJS 10+ modular monolith — authoritative business core
  desktop/    Tauri 2 shell (Windows/macOS) embedding shared React UI + Rust hardware bridge
  mobile/     React Native / Expo app — iOS + Android field flows
services/
  ai/         Python 3.12 + FastAPI — forecasting, anomaly detection, OCR, NL analytics
packages/
  domain/     framework-free TypeScript domain rules & invariants (money, allocation, state machines)
  contracts/  OpenAPI-generated types + event schemas (zod)
  ui/         shared design system (React + Tailwind + Radix/shadcn-style primitives)
  auth/       authorization helpers, permission catalogs, scope utilities
  sync/       outbox/inbox protocol, conflict policies, client SDK
  config/     eslint/prettier/tsconfig/commit conventions
  testing/    factories, fixtures, invariant test harness
infra/
  docker/     compose stacks (dev, on-prem)
  migrations/ PostgreSQL migration home (api-owned)
  monitoring/ dashboards, alert rules, log pipelines
docs/         this documentation tree
```

**Why not microservices:** the audit's #1 defect class is *non-atomic multi-table financial writes* (D4). Financially coupled operations (sale + stock + tax + payment + GL) must commit in **one** PostgreSQL transaction (master prompt §17). A modular monolith with enforced module boundaries (ESLint import rules, per-module NestJS modules, repository per aggregate) delivers distributable later without sacrificing transactional integrity now.

## 2. Technology decisions

| Concern | Choice | Rationale |
|---|---|---|
| Web portal | Next.js + TypeScript, PWA | SSR speed on low-bandwidth, offline queue via IndexedDB for POS-critical web flows |
| API | NestJS + TypeScript | Structured modules/DI, OpenAPI generation, typed contracts shared with clients |
| Database | PostgreSQL 16+ | Authoritative ledger; `numeric` money, `timestamptz`, enums, RLS-ready, logical replication |
| Money | `numeric(18,4)` amounts + integer pesewas where needed; **no float anywhere** | Legacy `double` drift is defect D5 |
| IDs | UUIDv7 (ordered, index-friendly) + human document numbers from sequences | Sync-safe client-generated IDs, printable codes |
| ORM | Prisma or TypeORM with explicit SQL for ledger paths | Ledger writes need precise control; repository layer abstracts |
| Background jobs | BullMQ (Redis) — outbox relay, notifications, report generation, AI jobs | Not required for POS commit (asynchronous only) |
| AI service | FastAPI + scikit-learn/Prophet-or-statsmodels tier, OCR (document intelligence), embedding store optional (pgvector) | Versioned models, auditable runs, tenant isolation |
| Desktop | Tauri 2 + Rust | Small binaries, native hardware access, safe IPC |
| Mobile | React Native + Expo (dev clients for native modules) | Code sharing with web UI layer, OTA updates |
| Offline store | SQLite (Drift/react-native-sqlite-storage / tauri plugin sql) + IndexedDB (web PWA) | Durable, queryable replicas |
| Auth | Session/JWT hybrid: short-lived access + rotating refresh; Argon2id; TOTP MFA for privileged roles; device registry | See [security-rbac.md](security-rbac.md) |
| Testing | Vitest (unit/property), pytest (AI), Playwright (web E2E), Detox/Maestro (mobile), Tauri + WebDriver (desktop smoke), testcontainers (PG integration) | Invariant-heavy domain demands property tests (calculation-register invariants 1-9) |
| CI/CD | GitHub Actions: lint → typecheck → unit/property → integration → build → E2E (staging) → security scans | Keep main buildable (working rule 3) |

Pinned versions live in each package manifest; upgrade policy documented in `docs/STATUS.md`.

## 3. Module boundaries inside the API (NestJS)

| Module | Owns (aggregates) | May call |
|---|---|---|
| `identity` | users, roles, permissions, sessions, devices | — |
| `tenancy` | tenants, branches, warehouses, shops, assignments | — |
| `catalog` | products, categories, units & conversions, barcodes, price lists | — |
| `inventory` | stock ledger, movements, counts, adjustments, transfers, locations | catalog, tenancy |
| `sales` | quotations, sales orders, fulfillments (waybills), invoices | catalog, inventory, parties, payments (via events) |
| `purchasing` | POs, GRNs, supplier invoices, debit notes | catalog, inventory, parties, payments |
| `parties` | customers, suppliers, credit terms, segments | — |
| `payments` | receipts, payments, tenders, allocations, deposits/credits, refunds | parties, banking |
| `banking` | accounts, transfers, reconciliations | accounting |
| `accounting` | CoA, journal entries, posting engine, periods, statements | (subscribed by all via events) |
| `returns` | return orders, credit notes, store credits | sales, inventory, payments, accounting |
| `reporting` | read models, KPI snapshots, exports | read-only replicas of all |
| `notifications` | templates, providers (SMS/email/push), preferences | event-driven |
| `sync` | change feed, outbox/inbox endpoints, device cursors | all (read) |
| `audit` | append-only audit events | all (write-only via interceptor) |
| `migration` | legacy_raw staging, import pipelines, reconciliation reports | isolated schema |

Cross-module consequences run through the **outbox** (domain events) — e.g. `InvoicePosted` → accounting posts GL, notifications queue SMS, reporting refreshes, AI jobs enqueue. The posting of the *source* aggregate and its outbox row commit in one transaction (transactional outbox).

## 4. The financial core pattern (the anti-Admin.php)

Every money operation:
1. Command DTO validated (zod contract) + idempotency key required.
2. Domain service in `packages/domain` computes derived values (totals, allocations, statuses) — pure functions, property-tested against [calculation-register.md](../legacy-audit/calculation-register.md) invariants.
3. Repository persists aggregate + ledger lines + outbox events in ONE PG transaction.
4. Ledger lines are append-only; corrections are reversal documents.
5. Audit interceptor records who/when/what (before/after JSONB).
6. Read models/current balances are caches rebuilt from ledgers (reconciliation job proves equality nightly).

## 5. Why the legacy architecture is not ported (evidence-linked)

| Legacy pattern | Defect | Replacement |
|---|---|---|
| 26k-line god controller | unmaintainable duplication (two dead engines ≈ 5k lines) | domain modules + services |
| Client-computed totals/status (`hidden_total_pos`) | R3/R4 status bugs, D1 money multiplication | server-side computation only |
| `update_ables` browser ledger overwrite | D3 | subledger-derived control accounts + reconciliation |
| Per-row duplicated order totals | R14 | normalized header/line tables |
| In-place edits/deletes of posted financials | D11, R9 | void/reversal documents |
| Free-text statuses | inconsistent ladders | enums + state machines with guarded transitions |
| Account-name string keys in GL | D8 orphaned TB rows | FK'd chart of accounts |
| No transactions | D4 | single-transaction posting |
| Second-resolution codes | D2 | sequences + UUIDv7 |

## 6. Repository working rules (from master prompt §21)

1. Long-lived feature branches per phase; `main` always buildable; PRs with tests.
2. No `node_modules`, secrets, or client PII committed. Secret scanning + dependency scanning in CI.
3. Every module claims "done" only with unit + invariant + E2E of its critical flow.
4. `docs/STATUS.md` maintained each phase; ADRs for significant decisions in `docs/adr/`.
