# Existing-Client Migration and Reconciliation Strategy

Migration is a first-class deliverable (master prompt §15). Existing clients' balances, stock, invoices, payments, history and auditability must survive cutover. This strategy is idempotent, repeatable, and evidence-based.

## 1. Toolchain

- **Importer** (NestJS module `migration`, CLI-runnable): reads a **full production MySQL dump** (the repo's sanitized schema is structure-only — the tool must handle real dumps at 10⁵-10⁶ row scale: `general_journal` ≈ 171k, `stock_manager` ≈ 842k, `payment_with_goods` ≈ 50k, `invoice` ≈ 41k, `payment` ≈ 43k per client).
- Pipeline: `dump → quarantined MySQL staging instance → legacy_raw schema (verbatim copy, no mutation) → validators → transformers → target PostgreSQL → mapping tables → reconcilers → reports`.
- Every run is **idempotent**: keyed upserts by (legacy_table, legacy_id); re-runs repair; run id stamps every artifact. The tooling is engineered continuously from **Phase 1** (skeleton, `legacy_raw`, run registry, legacy-ID mapping, checksums, validators, quarantine, reconciliation contracts, fixtures, CI smoke test, idempotent importer harness) and grows per product phase — see [ROADMAP.md](../ROADMAP.md); Phase 8 executes production cutover with tooling that is already mature.
- Outputs per run: `reconciliation.json` (machine) + `reconciliation_report.md` (human) + quarantine tables.

## 2. Stage gates

1. **Load & verify** — dump loads into staging MySQL; row counts + checksums per table recorded; encoding scan (utf8mb3/utf8mb4/latin1 mix per schema header).
2. **Copy to `legacy_raw`** — verbatim, including rows the code never used; nothing mutated at source.
3. **Validate** — encoding, date parsability, orphan FKs, dual-table consistency (sales_order vs payment_with_goods per so_code), header-field consistency per R14, D1-receipt detection (multi-account specific-invoice receipts), duplicate receipt codes (D2), duplicate customer/item names, `Opening-*`/`Deposit-*`/`LPAY-`/`R`-suffix code census. Quarantine unparsable/orphan rows with reasons.
4. **Transform** — per [legacy-to-postgres-map.md](legacy-to-postgres-map.md); master data first (users, parties, products/units, price lists, CoA, sequences/booklets), then opening-balance documents, then open transactions (open SOs with fulfillment state, open AP), then historical documents (closed invoices/payments/POs as read-only history), then optional attendance history.
5. **Recompute & reconcile** — see §3.
6. **Report & sign-off** — human review of diffs above thresholds; accountant sign-off during pilot.

## 3. Reconciliation reports (old vs new — correction-aware)

| Check | Old source | New source | Pass criterion |
|---|---|---|---|
| Customer count | customers | customer | equal (quarantined duplicates listed) |
| Customer balances | Σ invoice.amount_due sign-convention | Σ open invoices + credits | reconciled: equal within 0.01 per customer, or explained by approved correction records (§3a); every diff itemized |
| Supplier count & balances | suppliers / Σ accounts_payable.amount_due | supplier / open payables | same |
| Item count & on-hand by item/location | items.quantity + unit_quantity | opening count + ledger | equal after count adjustments; every adjustment listed with reason |
| Inventory value | items × purchase_price | opening value at chosen cost basis | diff explained by basis change |
| Invoices by status & totals/due/paid | invoice | invoice | D1-affected invoices: payment rows are the canonical evidence; each correction emitted as a §3a record (legacy_stored vs legacy_reconstructed vs new_system) requiring sign-off |
| Sales totals by day/month/customer/item | payment_with_goods/sales_order | invoice lines | equal within tolerance |
| Payments/receipts by method/account | payment | payment+tender | equal; cheque/momo detail gaps listed (legacy dropped details in receive-payment flow) |
| AR / AP totals | derived sums + accounts.current_balance | subledgers | **derived wins**; legacy control-account figure reported as drift (D3 evidence) |
| Cash/bank/MoMo balances | accounts.current_balance | reconciled statements | bank-confirmed figures win; drift reported |
| Journal debit/credit totals | general_journal | legacy_raw reference | informational (new GL opens from opening TB) |
| Trial balance | legacy TB (movement-only) | opening TB | equity plug documented |
| Returns/refunds/store credits | (broken flows) | final-state import | historical edited orders listed; no synthesized returns |
| Open POs / open SOs | status != Paid/closed | open docs | equal |
| Document number uniqueness | so/po/invoice/waybill/receipt codes | unique constraints | collisions (D2 receipts) resolved with suffixes + report |

Every check emits `section → expected / actual / diff_rows[]`; the JSON is machine-assertable in CI dry-runs.

### 3a. Correction-aware reconciliation records (legacy parity ≠ canonical truth)

Phase 0 proves some stored legacy values are already wrong (D1 split-payment money multiplication, D3 browser-overwritten AR/AP balances via `update_ables`, D7 frozen `debtors`/`creditors` snapshots, R8 discount inconsistency, R14 duplicated per-row order totals, D9 unreliable journals, I1 stock drift across ≥7 stores). Reconciliation therefore does **not** blindly require new-system equality with corrupted legacy values.

Every material diff is emitted as a **reconciliation record** with at least:

| Field | Meaning |
|---|---|
| `legacy_stored_value` | the value as stored in legacy, verbatim |
| `legacy_reconstructed_value` | value rebuilt from the most trustworthy underlying legacy evidence (§3a.1) |
| `new_system_value` | the migrated/new-system value |
| `correction_delta` | `new_system_value − legacy_stored_value` (and vs reconstructed where applicable) |
| `correction_reason` | human-readable cause (e.g. "D1: receipt total posted once per account — 2 accounts × total") |
| `evidence` | reference to the identified legacy defect: defect ID, audit doc section, legacy table/ids |
| `severity` | S1–S3 per the audit's scale |
| `requires_manual_approval` | true for every intentional deviation from legacy-stored figures |
| `approved_by` / `approved_at` | accountant/owner sign-off where applicable |

**Principles (non-negotiable):**

1. **Never silently repair data.** Every deviation from a stored legacy value is a record.
2. **Never copy known-bad figures** simply to achieve zero reconciliation difference — parity with corruption is failure, not success.
3. Canonical values derive from the **most trustworthy underlying evidence**, never from the corrupted aggregate.
4. All intentional corrections appear in the migration reports and require the appropriate **accountant/owner sign-off** before cutover; unapproved correction rows block the go/no-go checklist.

**Evidence hierarchy for known defects:**

| Known defect | Canonical evidence source | Rule |
|---|---|---|
| D1 split-payment multiplication | `payment` rows (per-account shares) | invoice.amount_paid / AR rebuilt from payment rows; the inflated stored totals are recorded as `legacy_stored_value` |
| D3 `update_ables` overwrites | document subledgers (invoice / AP sums) | derived subledger balances win; `accounts.current_balance` is reference only |
| D7 frozen `debtors`/`creditors` | derived subledger sums at cutover | frozen snapshots reported as drift evidence, never imported as truth |
| R8 / R14 discount & duplicated totals | invoice header amount + rebuilt lines | `invoice.amount` is the authority; Σ legacy SO rows recomputed with proper discount allocation |
| D9 / D8 unreliable journals | source documents, not legacy journals | new GL opens from an opening trial balance built from documents; legacy journal replay is reference-only |
| I1 stock drift (≥7 stores) | **physical count at cutover** | see §4 |

#### 3a.1 Reconstruction rules

`legacy_reconstructed_value` is computed only from underlying rows that were demonstrably **not** corrupted by the defect class (for D1: the per-account `payment.amount` rows; for D3: per-invoice `amount_due` sums). If the underlying evidence itself is insufficient, the field is null and the diff requires manual resolution — the importer must not guess, and it must not substitute the corrupted aggregate.

## 4. Opening stock: count-first policy

Because stock is stored in 7 drifting places (audit I1) and historical snapshots are provably inconsistent (`updateZeroBalanceItems` exists as a patch), the **physical count is the preferred — and default — cutover authority for opening stock**:
1. Pre-cutover: clients run cycle counts of A-class items during parallel-run.
2. Freeze night: full count (or agreed sampled count + system figure for C-class).
3. Import computes system-vs-count variance → adjustment documents with reasons; variance beyond threshold (default 2% value or per-item 5%) requires sign-off.
4. `legacy_raw` retains all legacy stock tables for forensic queries.
5. **Fallback (explicit risk acceptance):** where a client declines a physical count and legacy stored quantities (`items.quantity`/`items.unit_quantity`) are imported instead, every affected item/location is flagged `accepted_migration_risk = true` in the run report and requires explicit owner + accountant sign-off before cutover. The importer must never fall back to legacy quantities silently.

## 5. Parallel-run & cutover procedure (per client)

1. **Pilot import** (staging) → reconciliation → accountant + owner review; sign-off sheet.
2. **UAT** on staging with real roles; critical flows E2E (cash sale, credit sale, part payment, deposit, PO→pay, transfer, return, shift).
3. **Limited parallel-run** (1-2 weeks, chosen branch or whole shop if feasible): legacy remains system of record; new system mirrors key-entry daily (or read-only shadow reports); daily variance report.
4. **Final delta migration**: freeze legacy (read-only banner) → delta import (rows newer than last watermark) → final reconciliation → go/no-go checklist.
5. **Cutover**: DNS/device switch; legacy VPS kept **read-only for 90+ days** (its unauthenticated endpoints must be firewalled immediately — E1 makes continued exposure unacceptable).
6. **Post-cutover**: 2-week hypercare with daily reconciliation; rollback criteria: unreconcilable balance difference > agreed threshold or blocking defect in core POS flow → switch back to frozen legacy (replay of new transactions documented as manual export since rollback of ledger is not possible).

## 6. Rollback plan

- New system frozen; legacy re-opened read-write after delta reversal review.
- Transactions created in the new system during the failed window are exported (they are all documents) and re-entered/verified in legacy — the runbook includes the export script.
- Decision authority and time limits defined in the client runbook (default rollback window: first 72 hours).

## 7. Security during migration

- Dumps move encrypted (at rest + transit); staging access restricted + audited; **no production PII in the repository or test fixtures** (working rule; synthetic factories for tests).
- `migration.run` permission required; every step audit-logged.
- Legacy credentials rotated at cutover (SEC-NOTE demands rotation anyway).

## 8. Runbook artifacts (finalized Phase 8; built continuously from Phase 1)

- `migration runbook` (per-client checklist), dry-run CI job against a fixture dump, go/no-go template, sign-off sheet, hypercare calendar, rollback script bundle.
