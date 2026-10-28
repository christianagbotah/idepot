# iDepot Modernization — Status Board

| | |
|---|---|
| **Current phase** | Phase 2 — master data & inventory (+ continuous migration: master data & stock) (this branch) |
| **Previous phases** | Phase 0 — forensic audit & architecture ✅ (merged); Phase 1 — monorepo foundation + migration engineering foundation ✅ (merged) |
| **Branch** | `phase-2/master-data-inventory` |
| **Repo state** | Phase 2 implementation: catalog/parties/pricing/stock ledger/counts/transfers + migration extension, tests, UI slices |

## Completed capabilities (Phase 1 — merged to main, preserved unchanged)

- ADR-0001 Posting Coordinator / Unit-of-Work (AsyncLocalStorage + repository-layer enforcement); ADR-0002 DB/ORM decision (PostgreSQL + TypeORM chosen, pg base layer, Kysely for reporting); ADR-0003 RLS topology (shared schema, transaction-scoped `SET LOCAL app.tenant_id`, fail-closed).
- AuthN (Argon2id, HS256 pair, device registry), RBAC (catalog + matrix tests incl. cross-tenant impossibility), audit events, transactional outbox + change feed, checksum-verified idempotent migrations, clean-checkout typecheck gate (`typecheck:clean`), security CI (gitleaks + runtime/full dependency audits), migration engine with quarantined staging → legacy_raw → validators → transform → correction-aware reconciliation; D1 evidence pipeline.

## Completed capabilities (Phase 2 — this branch)

**Decimal-safe foundation (`packages/domain`):**
- `decimal.ts`: exact scaled-BigInt arithmetic (parse strict, half-even rounding, exact-vs-rounded multiply) — NO floating-point anywhere in quantity/money paths.
- `quantity.ts`: base-quantity conversion with EXACT conservation (a conversion that cannot terminate at 6 dp is rejected, never rounded).

**Catalog (API + RLS + RBAC):** products (code/name/category/supplier/brand/base unit SMU/status/prices), two-level categories, brands, units, configurable conversions (`product_unit`, factor-to-base numeric(18,6) > 0), barcodes (tenant-scoped unique).

**Parties:** customers/suppliers — Ghana phone-first identity (phone required, email optional), codes auto-derived or provided; party opening-balance document foundation (document + audit + outbox now; GL posting Phase 4).

**Effective-dated pricing:** standard + customer lists; per-product+unit windows with a DB-level EXCLUDE (no overlapping windows); precedence customer list → standard list → product default; rows immutable once effective (historical resolutions stay stable — proven by test).

**Inventory (all writes through the Posting Coordinator):**
- Append-only `stock_movement` ledger (7 movement types incl. transfer_out/in, count_variance, reversal; signed base quantities; cross-unit movements store transacted unit+quantity+factor beside the base quantity). DB-level append-only: app role has SELECT/INSERT only (UPDATE/DELETE denied — tested).
- `stock_balance` is a derived projection, never truth: rebuild job recomputes from the ledger and repairs drift (`on_hand == Σ movements` invariant test + drift-injection test).
- Row-locked balance posting (no oversell; oversell policy arrives with offline sync in Phase 3).
- Stock counts: draft → counted → approve; approval posts variance adjustments + movements in the SAME transaction; material variance approval gated by `stockcount:approve` (cashier 403 tested).
- Adjustments: reason-mandatory documents; cross-unit evidence optional per line; explicit reversal endpoint (reversal movements with `reversal_of`, double-reversal rejected).
- Transfers: draft → in_transit → received; partial receipt accumulates; over-receipt rejected; cancel-after-dispatch rejected; dispatch/receive both audited — no silent quantity disappearance.
- Opening stock: count-first authority (physical_count default); `legacy_quantity` authority REQUIRES accepted-migration-risk flag + approve permission — never silent (strategy §4).

**Migration workstream (extends the Phase 1 engine):**
- Imports: item categories (two-level) → product_category; units + units_items → unit + product_unit (unit_total → exact factor; base = smallest-unit row; non-terminating ratios → documented 6dp rounding warning); items → product + barcode (duplicate barcode/code quarantine); customers/suppliers → phone-first parties; opening stock → approved count documents (authority/risk/evidence flags) + opening-balance receipt movements + derived balances, all via `legacy_id_map` (idempotent re-runs: reused, never duplicated).
- I1 discrepancy detection: legacy stored (quantity × package factor + loose) vs physical count vs new opening — correction-aware records `I1_OPENING_STOCK_COUNT_VARIANCE` (count wins) and `I1_LEGACY_QUANTITY_WITHOUT_COUNT_ACCEPTED_RISK` (fallback requires owner/accountant sign-off; never silent).
- New validators: numeric parsability (malformed conversion factor), invalid conversion (≤ 0), extended FK orphans (category/supplier/units/count-sheet). New quarantine reasons: `numeric_unparsable`, `invalid_conversion`, `duplicate_barcode`.
- Fixture extended: 10 items (5 Phase-1 rows byte-identical), 12 conversions (bundle/ton/bottle/carton/coil realities), 4 customers, 2 suppliers, 4-row count sheet; deliberate cases: malformed conversion, invalid factor, duplicate barcode, orphan category, orphan count row, count variance ×2, accepted-risk fallback ×2.

**UI (apps/web, responsive, functional):** login → session shell; catalog (products + conversions + barcodes), categories, units, customers, suppliers, warehouses, stock overview (+ ledger verify), movements, counts (create/submit/approve), adjustments (+ reverse, cross-unit lines), transfers (dispatch/receive with per-line progress).

**RBAC additions:** catalog/party/pricing/inventory read+write; stockcount read/count/**approve** (supervisor gate). Roles updated: manager ≈ ops-full; cashier read + count; auditor read.

## Verification summary (Phase 2)

| Check | Result |
|---|---|
| Domain unit tests (decimal math, conversion conservation property sweep) | 16/16 |
| Unit (auth: Argon2id, RBAC decision, JWT types) | 4/4 |
| Migration guard (41 tables, append-only ledger grants, RLS, idempotency) | 6/6 |
| Migration smoke + Phase 2 import + idempotency re-run | 9/9 |
| Posting Coordinator atomicity + enforcement | 3/3 |
| RBAC matrix + cross-tenant impossibility | 26/26 |
| Vertical slice E2E | 7/7 |
| **Inventory invariants: on_hand≡Σ movements, rebuild-repairs-drift, cross-unit conservation, reversal restores, tenant isolation, coordinator rollback (zero partial state)** | **7/7** |
| **E2E: transfer partial-receipt, count approval (RBAC-gated), opening-stock authority, pricing effective-dating** | **5/5** |
| Lint / **clean** typecheck (no dist) / build | clean (9 workspaces) |
| npm audit (runtime + full) / gitleaks | 0 / clean (unchanged) |
| CLI migration smoke (fixture → legacy_raw → reconciliation.json) | PASS (artifact: 4/4 checksums, 9 quarantined, 6 correction records) |

## Exit criteria check (ROADMAP Phase 2)

- [x] invariant tests: `balance ≡ Σ movements` (ledger rebuild) + conversion conservation (exact)
- [x] E2E: transfer + count + adjustment flows green (incl. partial receipt, over-receipt rejection, supervisor-gated approval)
- [x] ledger rebuild job proves equality on fixture data (drift injection → repair → verified)
- [x] migrated master data reconciles against fixture dumps with zero unapproved correction rows — every material diff (D1 ×2, I1 variance ×2, I1 accepted-risk ×2) has a full correction record flagged `requires_manual_approval` (2 D1 critical, 2 I1 high, 2 I1 critical); clean paths (exact count) emit none
- [x] fresh-checkout CI green — see run on this branch (verify + security jobs)
- [x] security gates green (gitleaks full history + runtime/full dependency audits) — unchanged from Phase 1

## Known limitations / deferred (deliberate)

- Stock identity is (product, warehouse); bins/shelf-level locations deferred (legacy had none wired).
- Transfers move base-unit quantities (cross-unit transacted evidence is captured on adjustments; sale/issue documents with units arrive with POS in Phase 3).
- Party opening balances are document foundation only — AR/AP/GL posting + reconciliation land in Phase 4 per the migration map.
- Outbox projector remains the Phase 1 primitive (read + ack); scheduled dispatcher waits for the first real consumer.
- Pricing covers standard + customer lists; segment lists and per-customer unit-price migration (`items_prices`/`items_units_prices`) are scheduled with the sales-phase migration.
- Web session lives in localStorage; token refresh UX and device registration screens arrive with offline sync (Phase 3).

## Next actions (Phase 3 — Sales & POS)

1. POS screen (keyboard-first), sales orders + state machine, fulfillments/waybills with sequence leases.
2. Invoices + payments/tenders/allocations posting through the coordinator (document + stock + COGS + tender + allocation + subledger + tax + GL + audit + outbox).
3. Offline engine (SQLite replica + outbox sync) with idempotent sync + chaos suite.
4. Migration: sales orders/invoices/payments (D1-corrected reconstruction), deposits/credits, open-SO carryover.
