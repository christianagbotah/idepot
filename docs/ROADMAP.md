# Phased Implementation Roadmap

Phase 0 (this branch) is complete. Phases follow master prompt §20 with entry/exit criteria. Each phase keeps the repo buildable and ends with a PR + STATUS update.

## Phase 0 — Forensic audit & architecture ✅ (this PR)

Delivered: 20 legacy-audit documents, 8 architecture documents, 2 migration documents, roadmap, status board. Business-rule map and migration baseline established. **No production code written** (deliberate).

## Phase 1 — Monorepo foundation

**Scope:** scaffold `apps/`+`packages/`+`infra/`; CI (lint/typecheck/test/build); PostgreSQL + migrations framework; NestJS skeleton with module boundaries; auth (Argon2id, tokens, device registry); tenancy model (tenant/branch/warehouse); RBAC (permissions, roles, scopes) + authorization matrix test harness; audit-event interceptor; Next.js shell + design system baseline; versioned API contracts (OpenAPI); outbox/change-feed primitives; Docker dev stack.

**Exit criteria:** auth+RBAC enforced on a sample CRUD resource with matrix tests green; CI green; ADRs for stack choices.

## Phase 2 — Master data & inventory

**Scope:** products/categories/units/conversions/barcodes; price lists (effective-dated, customer/segment); customers/suppliers (+opening-balance documents); warehouses/bins; **stock ledger** (movements, reasons, balances) with reconciliation job; stock counts/adjustments; transfers (location-to-location, in-transit).

**Exit criteria:** invariant tests (`balance ≡ Σ movements`, conversion conservation); E2E: transfer + count + adjustment flows; ledger rebuild job proves equality on fixture data.

## Phase 3 — Sales & POS

**Scope:** POS screen (desktop-first, keyboard-first); quotations; sales orders with state machine; fulfillments/waybills with sequence leases (incl. booklet import mode); invoices; deposits/customer credits; payments with tenders + allocations; receipts (thermal/A4) via hardware bridge; cashier shifts (open/close/variance); offline engine (SQLite replica + outbox) with idempotent sync.

**Exit criteria:** E2E cash sale, credit sale, part payment, deposit→allocation, offline sale→sync (chaos suite); allocation invariants property-tested; performance: sub-second sale commit locally.

## Phase 4 — Purchasing & accounting

**Scope:** PO/GRN/supplier invoice 3-way match; debit notes; AP payments/allocations; chart of accounts (effective-dated); posting engine (transactional, ΣD=ΣC); banking (accounts, transfers, statement import + matching); AR/AP subledgers; trial balance/P&L/balance sheet/cash flow; period close/lock.

**Exit criteria:** posting engine invariants; statement tie-outs (TB↔BS, P&L COGS ↔ stock ledger); E2E purchase→pay; reconciliation assistant hooks present.

## Phase 5 — Returns, reporting, loyalty & administration

**Scope:** return orders/credit notes/store credits/refunds (built on the legacy dead-DDL design) with approvals + audit; operational + financial report suite (incl. aging, statements, margin with single cost basis, daily stock/backlog successors); KPI snapshots + targets; loyalty (if product-confirmed — legacy DDL never ran, so validate demand first); configuration UX; comprehensive audit search/export.

**Exit criteria:** return↔inverse-postings invariant tests; report parity checklist vs legacy outputs (documented differences only); statement reconciliation test.

## Phase 6 — Desktop/mobile & hardware hardening

**Scope:** Tauri 2 Windows/macOS installers (MSI/NSIS, DMG, auto-update); React Native iOS/Android releases; scanner/printer/drawer/label adapters with test screens; device management; offline stress (50-terminal simulation); print template gallery (receipt/invoice/waybill/labels/statement).

**Exit criteria:** hardware device-matrix tested; installer smoke tests in CI (where possible); offline chaos suite green; OTA pipeline working.

## Phase 7 — AI intelligence

**Scope per [ai-opportunity-map.md](architecture/ai-opportunity-map.md) tiers:** 7a rules-based (dead stock, anomaly rules, dedupe, stockout alerts) → 7b forecasting/reorder/supplier score/briefing → 7c segmentation/credit-risk/cash-flow/reconciliation-matching/count assistant → 7d OCR/NL-BI/pricing assistant.

**Exit criteria:** backtests with time-aware splits; tenant isolation tests; every feature degrades gracefully with AI service down; audit rows for material recommendations.

## Phase 8 — Migration & cutover tooling

**Scope:** importer against full MySQL dumps (staging pipeline per strategy doc); reconciliation report generator (JSON + human); delta migration; pilot/parallel-run/hypercare runbooks; rollback scripts; per-client cutover execution.

**Exit criteria:** repeated dry-runs green on fixture dump with zero unexplained diffs; pilot client signed off; rollback rehearsed.

## Cross-phase working agreements

- `docs/STATUS.md` updated every phase; ADRs for deviations.
- Every phase PR includes tests proving its audit-derived invariants (calculation-register §"cross-cutting corrected invariants").
- Legacy tree is frozen evidence; no edits.
- Security regression suite grows with each phase (defects-and-risks §E items → tests).
