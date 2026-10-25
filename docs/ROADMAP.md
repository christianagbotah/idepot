# Phased Implementation Roadmap

Phase 0 (this branch) is complete. Phases follow master prompt §20 with entry/exit criteria. Each phase keeps the repo buildable and ends with a PR + STATUS update.

Two continuous workstreams run through every phase:

1. **Atomic financial posting.** Every financially coupled operation commits in ONE PostgreSQL transaction through the Posting Coordinator / Unit of Work ([target-architecture.md](architecture/target-architecture.md) §4): business document, stock/COGS movements, tender, allocation, subledger impact, tax lines, GL journal entry, audit event and outbox rows succeed or fail together. Asynchronous consumers (outbox) handle only consequences that do not determine financial correctness — notifications, reporting/read-model refresh, search indexing, analytics, AI, webhooks. Every phase's new documents must register their posting participants with the coordinator; PR review checklist item.
2. **Migration engineering (Phase 1 → 8, continuous).** Existing customers must move from the production legacy system without losing balances, documents, stock, payments, history or auditability — so migration cannot be postponed until the end. The `migration` module, `legacy_raw` schema and reconciliation framework are built in Phase 1 and grow in lockstep with each product phase, so every new domain model is tested against migration reality while it is designed — instead of discovering incompatibilities at the end. Reconciliation is **correction-aware**: legacy parity is not the goal, canonical truth is ([migration-reconciliation-strategy.md](migration/migration-reconciliation-strategy.md) §3a).

## Phase 0 — Forensic audit & architecture ✅ (this PR)

Delivered: 20 legacy-audit documents, 8 architecture documents, 2 migration documents, roadmap, status board. Business-rule map and migration baseline established. **No production code written** (deliberate).

## Phase 1 — Monorepo foundation + migration engineering foundation

**Product scope:** scaffold `apps/`+`packages/`+`infra/`; CI (lint/typecheck/test/build); PostgreSQL + migrations framework; NestJS skeleton with module boundaries; auth (Argon2id, tokens, device registry); tenancy model (tenant/branch/warehouse); RBAC (permissions, roles, scopes) + authorization matrix test harness; audit-event interceptor; Next.js shell + design system baseline; versioned API contracts (OpenAPI); outbox/change-feed primitives (non-financial consumers only); **Posting Coordinator / Unit-of-Work framework** (participant registration, single-transaction guard, rollback-on-failure semantics) with a reference implementation and atomicity test on a sample document; Docker dev stack.

**Migration workstream (built now, evolved every phase):**

- `migration` module skeleton + CLI-runnable harness;
- quarantined legacy import architecture (dump → staging MySQL → `legacy_raw`, no source mutation);
- `legacy_raw` PostgreSQL schema (verbatim staging, isolated);
- migration run registry (`migration_run`: dump fingerprint, per-table row counts/checksums, stage status);
- legacy-ID mapping infrastructure (`legacy_id_map`: (legacy_table, legacy_id) → target entity; idempotent re-runs);
- checksum / row-count framework;
- validator framework (encoding, date parsability, orphan FKs, dual-table consistency, code-census checks);
- quarantine framework (unparsable/orphan rows withheld with reasons — never silently dropped);
- reconciliation JSON/report contracts (machine-assertable `reconciliation.json` + human report; correction-aware record schema per strategy doc §3a);
- synthetic/redacted legacy fixtures (no production PII);
- CI migration smoke test (fixture dump → import → reconcile on every pipeline change);
- repeatable/idempotent importer harness.

**Exit criteria:** auth+RBAC enforced on a sample CRUD resource with matrix tests green; CI green; posting-coordinator reference test proves all-or-nothing rollback; migration smoke test runs a fixture dump end-to-end and emits `reconciliation.json` in CI; ADRs for stack choices.

## Phase 2 — Master data & inventory (+ migration: master data & stock)

**Product scope:** products/categories/units/conversions/barcodes; price lists (effective-dated, customer/segment); customers/suppliers (+opening-balance documents); warehouses/bins; **stock ledger** (movements, reasons, balances) with reconciliation job; stock counts/adjustments; transfers (location-to-location, in-transit).

**Migration workstream:** import products, categories, units & conversions, customers/suppliers, locations; opening stock (count-first authority per strategy doc §4 — legacy-quantity-without-count is a flagged accepted risk requiring sign-off); inventory reconciliation (on-hand by item/location vs count + ledger).

**Exit criteria:** invariant tests (`balance ≡ Σ movements`, conversion conservation); E2E: transfer + count + adjustment flows; ledger rebuild job proves equality on fixture data; migrated master data reconciles against fixture dumps with zero unapproved correction rows.

## Phase 3 — Sales & POS (+ migration: sales cycle)

**Product scope:** POS screen (desktop-first, keyboard-first); quotations; sales orders with state machine; fulfillments/waybills with sequence leases (incl. booklet import mode); invoices; deposits/customer credits; payments with tenders + allocations; receipts (thermal/A4) via hardware bridge; cashier shifts (open/close/variance); offline engine (SQLite replica + outbox) with idempotent sync. All invoice/payment flows post through the Posting Coordinator — document + stock + COGS + tender + allocation + subledger + tax + GL + audit + outbox in one transaction.

**Migration workstream:** import sales orders, invoices, payments, allocations, deposits/credits, fulfillments/waybills; D1-corrected payment reconstruction (payment rows as canonical evidence) emitted as correction-aware reconciliation records; open-SO carryover with fulfillment state.

**Exit criteria:** E2E cash sale, credit sale, part payment, deposit→allocation, offline sale→sync (chaos suite); allocation invariants property-tested; posting-atomicity test (kill transaction mid-post → zero partial rows); performance: sub-second sale commit locally; migrated invoices/payments reconcile with per-document correction records for D1/R8/R14-affected rows.

## Phase 4 — Purchasing & accounting (+ migration: AP & books)

**Product scope:** PO/GRN/supplier invoice 3-way match; debit notes; AP payments/allocations; chart of accounts (effective-dated); posting engine (synchronous, ΣD=ΣC, coordinator-invoked); banking (accounts, transfers, statement import + matching); AR/AP subledgers; trial balance/P&L/balance sheet/cash flow; period close/lock.

**Migration workstream:** import POs, GRNs, AP, banking references, chart of accounts, journals (legacy journals imported as reference only); opening balances (AR/AP/customer-credit/supplier-credit per map doc §4) and financial reconciliation (opening trial-balance tie-out, documented equity plug).

**Exit criteria:** posting engine invariants; statement tie-outs (TB↔BS, P&L COGS ↔ stock ledger); E2E purchase→pay; reconciliation assistant hooks present; opening-balance documents reconcile and the opening trial balance is accountant-signed on fixture clients.

## Phase 5 — Returns, reporting, loyalty & administration (+ migration: returns & history)

**Product scope:** return orders/credit notes/store credits/refunds (built on the legacy dead-DDL design) with approvals + audit; operational + financial report suite (incl. aging, statements, margin with single cost basis, daily stock/backlog successors); KPI snapshots + targets; loyalty (if product-confirmed — legacy DDL never ran, so validate demand first); configuration UX; comprehensive audit search/export.

**Migration workstream:** import returns/refunds/store credits (final-state import for historically edited orders — no synthesized returns); reporting parity checks; remaining historical/admin data (attendance optional, messages/noticeboard per tenant choice, legacy document codes preserved).

**Exit criteria:** return↔inverse-postings invariant tests; report parity checklist vs legacy outputs (documented differences only); statement reconciliation test; historical data complete in fixture-dump imports.

## Phase 6 — Desktop/mobile & hardware hardening (+ migration: device/client concerns)

**Product scope:** Tauri 2 Windows/macOS installers (MSI/NSIS, DMG, auto-update); React Native iOS/Android releases; scanner/printer/drawer/label adapters with test screens; device management; offline stress (50-terminal simulation); print template gallery (receipt/invoice/waybill/labels/statement).

**Migration workstream:** device/client migration concerns — POS device registration and re-pointing to the new backend, local replica bootstrap from migrated data, booklet/sequence state carryover, legacy-credential rotation, read-only legacy firewalling plan.

**Exit criteria:** hardware device-matrix tested; installer smoke tests in CI (where possible); offline chaos suite green; OTA pipeline working; device re-pointing rehearsed against a staging legacy environment.

## Phase 7 — AI intelligence (+ migration: historical-data preparation)

**Product scope per [ai-opportunity-map.md](architecture/ai-opportunity-map.md) tiers:** 7a rules-based (dead stock, anomaly rules, dedupe, stockout alerts) → 7b forecasting/reorder/supplier score/briefing → 7c segmentation/credit-risk/cash-flow/reconciliation-matching/count assistant → 7d OCR/NL-BI/pricing assistant.

**Migration workstream:** AI historical-data preparation — cleaned/aligned history exports from `legacy_raw` + new ledgers, feature windows over migrated history, data-quality gates (correction-aware reconciliation must be green before AI trains on client data).

**Exit criteria:** backtests with time-aware splits; tenant isolation tests; every feature degrades gracefully with AI service down; audit rows for material recommendations; AI feature set validated against migrated history.

## Phase 8 — Production migration & cutover execution

The importer/validator/reconciler tooling is complete and continuously exercised from Phase 1; Phase 8 **executes production cutover** per client:

- full production dump dry-runs (repeated, reconciliation sign-off each round);
- delta migration (watermark-based incremental);
- pilot customers; parallel run; cutover-night runbook;
- rollback rehearsal + rollback criteria;
- reconciliation sign-off (correction-aware: all intentional corrections approved; zero unexplained diffs);
- hypercare (daily reconciliation, defined exit).

**Exit criteria:** repeated dry-runs green on production dumps with zero unexplained diffs (every diff either explained or an approved correction); pilot client signed off; rollback rehearsed; hypercare exited for the pilot cohort.

## Cross-phase working agreements

- `docs/STATUS.md` updated every phase; ADRs for deviations.
- Every phase PR includes tests proving its audit-derived invariants (calculation-register §"cross-cutting corrected invariants").
- Legacy tree is frozen evidence; no edits.
- Security regression suite grows with each phase (defects-and-risks §E items → tests).
- **Posting rule:** any new financially coupled write must go through the Posting Coordinator; PRs adding money paths without coordinator participation are rejected.
- **Migration rule:** each phase ends with its migration workstream items reconciling against fixture dumps in CI (zero unapproved correction rows); a product module is not "done" if the legacy data it succeeds cannot be imported and reconciled.
