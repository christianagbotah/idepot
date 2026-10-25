# iDepot Modernization — Status Board

| | |
|---|---|
| **Current phase** | Phase 0 — complete (this branch) |
| **Next phase** | Phase 1 — monorepo foundation + migration engineering foundation |
| **Branch** | `phase-0/forensic-audit` |
| **Repo state** | docs-only change set; legacy tree untouched |

## Completed capabilities

- Full forensic audit of the legacy CodeIgniter 3 application (`Admin.php` 26,024 lines / 165 functions; 66-table schema; 266 business views):
  - module inventory, view classification, controller-model-view-table cross-reference, table-by-table business map;
  - lifecycle maps: sales/POS (5 variants), purchasing, stock movements, payments/banking/MoMo, AR/AP, returns/refunds/credit, unit conversions, document numbering;
  - business-rules catalogue (preserve / fix-intent / drop tags) and calculation register (32 calculations with corrected rules + 9 invariants);
  - defects & risks register (S1-S3 severity, evidence-cited) including security findings;
  - dead/duplicate/school-code register (~8-9k dead lines identified);
  - RBAC as-built analysis, reports/KPI inventory, integration inventory.
- Target architecture: system context, monorepo structure (Next.js/NestJS/Python-FastAPI/PostgreSQL/Tauri 2/React Native), domain model, offline-sync protocol, POS hardware HAL, mobile apps, AI opportunity map, security & audit design.
- Migration: legacy MySQL → PostgreSQL column-level map; client migration & reconciliation strategy with parallel-run/cutover/rollback procedures.
- Phased roadmap (Phases 1-8) with entry/exit criteria.

## Current blockers

None for Phase 1. External dependencies to schedule early (migration engineering is a Phase 1 workstream, not a Phase 8 afterthought):
- production MySQL dump access for migration fixtures + the CI smoke test (Phase 1, needs client NDA-safe handling; synthetic/redacted fixtures acceptable until granted);
- client accountant availability — earlier than originally planned: correction-aware reconciliation sign-offs begin with Phase 2 master-data dry-runs, opening balances land in Phase 4;
- hardware procurement matrix for Phase 6 device lab.

## Test status

Phase 0 = documentation; no runtime tests yet. The audit defines the test obligations for later phases (invariant list in `docs/legacy-audit/calculation-register.md` §cross-cutting; security matrix in `docs/architecture/security-rbac.md` §8).

## Next actions (Phase 1 kickoff)

1. Scaffold monorepo per `docs/architecture/target-architecture.md` (apps/web, apps/api, packages/*, infra/docker), pinned versions.
2. CI pipeline (lint → typecheck → unit → build → security scans).
3. NestJS module skeletons + auth + tenancy + RBAC with the authorization-matrix test harness.
4. ADR gate before dependent production code: **ADR-0001** Posting Coordinator enforcement mechanics (application transaction context + repository-layer enforcement; NestJS HTTP interceptor alone insufficient — CLI migration, sync workers and internal service calls need the same guarantees); **ADR-0002** database access/ORM choice (benchmarked: cross-module transaction propagation, PostgreSQL numeric handling, raw/typed ledger SQL, migrations, bulk migration performance 10⁵–10⁶ rows, RLS/session context, testability — not CRUD convenience); **ADR-0003** multi-tenancy/RLS implementation for the locked topology.
5. First end-to-end vertical slice (login → tenant-scoped CRUD → audit event) as the integration template.
6. Posting Coordinator / Unit-of-Work framework (target-architecture §4) + reference test proving all-or-nothing rollback of the atomic posting set.
7. Migration foundation per ROADMAP Phase 1 workstream: `legacy_raw` schema, run registry, legacy-ID mapping, checksum/row-count framework, validator + quarantine frameworks, reconciliation JSON/report contracts, synthetic fixtures, CI migration smoke test, idempotent importer harness.

## Decision log (Phase 0)

- Business-rule baseline = audit documents; nothing ported blindly; every corrected rule documented with migration impact (master prompt §7 satisfied).
- Legacy `update_ables` browser-ledger pattern, per-row order totals, in-place financial edits, free-text GL account names and second-resolution codes are **explicitly banned** in the target system.
- The dead returns/loyalty/RBAC/multi-shop DDL generation is treated as *design intent evidence*, revived properly in the new schema rather than ported as-is.
- Stock baseline at cutover = physical count + documented adjustments (legacy stock state is not trustworthy per audit I1); using legacy stored quantity where no physical count is performed is an explicitly flagged accepted migration risk requiring owner + accountant sign-off.
- **Atomic financial posting (Posting Coordinator / Unit of Work):** for a POSTED financial transaction, all financially authoritative consequences — business document, stock/COGS movements, tender, allocation, customer/supplier subledger impact, tax lines, GL journal entry, audit event, transactional outbox row — commit or fail together in one PostgreSQL transaction. Outbox events MAY and SHOULD represent committed financial facts (`InvoicePosted`, `PaymentReceived`, `CreditNotePosted`, `StockMoved`, `PurchaseReceived`, `RefundPosted`); the rule is that no asynchronous outbox consumer may perform any financially authoritative posting required to make the source transaction correct — consumers only project (reporting, device sync feeds, notifications, search, analytics, AI, webhooks). No posted invoice may exist while its required GL or inventory posting waits for a background worker. *(Supersedes the earlier `InvoicePosted` → accounting-posts-GL-asynchronously framing and the interim "non-financial events only" wording.)*
- **Migration engineering starts in Phase 1** as a continuous cross-phase workstream (module skeleton, quarantined import architecture, `legacy_raw`, run registry, legacy-ID mapping, checksums/row counts, validators, quarantine, reconciliation JSON/report contracts, synthetic fixtures, CI smoke test, idempotent importer harness), evolving per phase: P2 master data & stock → P3 sales cycle → P4 AP & books/opening balances → P5 returns & history → P6 device/client concerns → P7 AI historical-data prep. Phase 8 is production cutover execution only (dry-runs, delta, pilot, parallel run, cutover, rollback rehearsal, sign-off, hypercare).
- **Correction-aware reconciliation (legacy parity ≠ canonical truth):** where the audit proves stored legacy values are wrong (D1 split-payment multiplication, D3 browser-overwritten AR/AP balances, D7 frozen debtor/creditor snapshots, R8 discount inconsistency, R14 duplicated per-row totals, D9 unreliable journals, I1 drifting stock), the importer reconstructs canonical values from the most trustworthy underlying evidence. Every diff record exposes legacy_stored_value, legacy_reconstructed_value, new_system_value, correction_delta, correction_reason, evidence/reference, severity, requires_manual_approval (+ approved_by/approved_at). Never silently repair; never copy known-bad figures to force zero reconciliation difference; intentional corrections appear in migration reports and require accountant/owner sign-off.
- **Tenancy topology — LOCKED:** primary cloud/SaaS = shared PostgreSQL cluster, `tenant_id` on every tenant-owned record, application-repository isolation + RLS defense-in-depth, tenant-scoped unique constraints, tenant identity on every audit/outbox/sync/migration/AI record, cross-tenant access proven impossible by authorization tests; dedicated/on-premise = the same application and logical schema as an isolated single-customer database/deployment — no separate domain model or migration format (target-architecture §6). Implementation details require ADR-0003 in Phase 1; the topology itself is decided.
- **Offline concurrency — local vs global correctness:** offline devices guarantee local correctness (correct math, balanced local representation, valid units, complete atomic local document, permissions valid per the signed authorization snapshot, idempotent identity); global/authoritative correctness is established only at sync. Concurrent offline oversell is never silently rewritten: configurable policy = negative/backorder with prominent exception + reconciliation task, or explicit review/exception state; optional stock leases/offline allocation quotas for hard-limit businesses (fully disconnected operation cannot mathematically guarantee global availability without leased capacity); credit-limit, period-close, revoked-permission and scope conflicts surface as explicit review/rejection workflows. UUID/idempotency prevents duplicate identity, NOT business conflicts (offline-sync §5a–5b).
- **Phase 1 ADR gate:** ADR-0001 (Posting Coordinator enforcement mechanics — app transaction context + repository-layer enforcement preferred; HTTP-interceptor-only insufficient), ADR-0002 (DB access/ORM — benchmarked on transaction propagation, numeric handling, raw ledger SQL, migrations, bulk migration performance, RLS/session context, testability), ADR-0003 (multi-tenancy/RLS implementation) are required before their dependent production code. Cost-basis policy, offline history retention, booklet lease size and loyalty remain later-phase controlled decisions; cost basis must be effective-dated/configurable and signed off during migration — never a silent change to historical accounting.
