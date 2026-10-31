# iDepot Modernization — Status Board

| | |
|---|---|
| **Current phase** | Phase 3 — sales & POS (+ financial hardening round) — implemented on this branch |
| **Previous phases** | Phase 0 — forensic audit & architecture ✅ (merged); Phase 1 — monorepo foundation + migration engineering foundation ✅ (merged); Phase 2 — master data & inventory ✅ (merged) |
| **Branch** | `phase-3/sales-pos` (from main @ `b07e80a6`) |
| **Repo state** | Phase 3 + financial hardening round: corrected sale posting, payments/deposits/allocations, orders/fulfillments, shifts, receipts, offline sync engine, migration of the legacy sales cycle, tax engine + GL journals + AVCO costing + override authorization + sync payload identity (independent review findings 1–5) |

## Completed capabilities (Phases 0–2 — merged to main, preserved unchanged)

- **Phase 0:** forensic audit (20 legacy-audit docs), target architecture, migration strategy baseline.
- **Phase 1:** ADR-0001 Posting Coordinator / Unit-of-Work (AsyncLocalStorage + repository-layer enforcement); ADR-0002 PostgreSQL + pg base layer; ADR-0003 RLS topology (shared schema, transaction-scoped `SET LOCAL app.tenant_id`, fail-closed). AuthN (Argon2id, HS256 pair, device registry), RBAC catalog + matrix tests, audit events, transactional outbox + change feed, checksum-verified idempotent migrations, clean-checkout typecheck gate, security CI, migration engine (quarantined staging → legacy_raw → validators → transform → correction-aware reconciliation).
- **Phase 2:** decimal-safe domain (exact scaled-BigInt), catalog/parties/effective-dated pricing, append-only stock ledger + rebuildable balances with concurrency-hardened posting (review fixes 1–6), counts/adjustments/transfers, opening stock with count-first authority, master-data + opening-stock migration with correction-aware reconciliation, functional UI.

## Completed capabilities (Phase 3 — this branch)

**Sales domain (`packages/domain/sales.ts`) — the corrected math, each rule citing its legacy defect:**
- C-1: line.net computed SERVER-side (client amounts advisory), half-even at 4dp exactly once per line.
- C-2: `invoice_total = Σ line.net − order_discount` computed once on the header (DB CHECK enforces `total = subtotal − discount`); the legacy R14 per-row duplication and R9 print mismatch are structurally impossible.
- C-6: `Σ tenders == amount_paid`, change never negative; overpay only in cash (non-cash excess rejected — deliberate credit goes through deposits); structured Ghana tenders (MoMo provider/phone/transaction id, cheque bank/branch/number) decoupled from account-name string matching.
- C-7: numeric payment ladder `unpaid → part_paid → paid → over_paid` derived from decimal comparison (legacy R4 compared POST strings with `===`).
- C-17/C-16: explicit allocation rows; `amount_due ≡ total − Σ allocations − Σ credits` (never negative unless a credit exists); customer balance = ONE subledger query.
- C-20/C-26: deposits are unapplied-cash liability documents + explicit `credit_application` rows (waterfall oldest-first) — never negative invoice rows.
- C-11: shift expected cash DERIVED from posted documents (float + cash tenders − change + paid-in − paid-out); variance = counted − expected, supervisor-reviewed.
- State machines: quotation (draft→converted/cancelled), sales order (draft→confirmed→partially_fulfilled→fulfilled→closed; cancel only before confirmation), fulfillment (draft→dispatched→delivered), shift (open→closed).

**Schema (migration 0006):** document_sequence + pre-printed booklets (verbatim codes, allocated IN ORDER under FOR UPDATE, first-class spoilage with mandatory reason) + offline sequence_lease; cashier_shift + cash movements; quotation/sales_order/fulfillment (+ `fulfilled ≤ ordered` CHECK); invoice/invoice_line (server totals, cost_at_sale snapshot, price-resolution evidence, client_doc_id uniqueness); append-only payment/payment_tender/payment_allocation/customer_deposit/credit_application (reversals are new documents — the legacy destructive edits are structurally impossible); `payment_allocation_guard` constraint trigger enforcing invariant 8 at the DB; sync_applied_event idempotency registry; tenant_config oversell policy; tenant-aware composite FKs; stock_balance CHECK relaxed to a sanity bound per offline-sync §5b (the 0004 fail-loud gate was explicitly "until Phase 3"); legacy_raw sales-cycle staging.

**Sale posting core (SalePoster — the ROADMAP Phase 3 atomic set):** ONE UnitOfWork transaction commits invoice + lines → stock issue movements (via StockPoster: configured conversion authority, deterministic balance locking) → COGS snapshot (cost_at_sale = purchase-price basis; configurable method + GL journal arrive with the Phase 4 posting engine — the same precedent as the Phase 2 opening-balance documents) → money tenders as a payment document + explicit allocation → credit tenders as credit applications (advisory-lock waterfall, append-only deposits) → audit event + outbox (`InvoicePosted`/`PaymentReceived`/`CreditApplied`/`StockMoved`/`SaleBackorderException` — committed facts only). Any throw rolls back the WHOLE set (proven by the kill-mid-post test). Oversell policy per tenant: `reject` (default; 409) | `allow_backorder` (ledger applies, prominent exception task raised INSIDE the posting tx).

**Payments & credit:** standalone receipts (typed tenders + explicit allocations, FIFO-optional but always written as rows); deposits; apply-credit with due/remaining validation; customer balance query.

**Orders & delivery:** quotations (proforma successor), sales orders — confirmation posts the invoice for the full order (legacy semantics) via the SalePoster set; fulfillments/waybills track the physical handover of already-sold goods with over-promise (in-flight + delivered ≤ ordered) and over-delivery guards; delivery advances the fulfilled counters and derives the order status.

**Document numbering:** counter sequences (row-locked `UPDATE … RETURNING` — legacy R6 race killed), booklet-first allocation for INVOICE/WAYBILL (pre-printed stock constraint; READ COMMITTED re-evaluation makes concurrent cashiers get different codes), spoilage, offline leases (expiry-bounded ranges validated at sync).

**Offline sync engine (server):** `POST /api/sync/push` applies each event in EXACTLY one PG transaction through the SAME posting coordinator as online commands (offline-sync §4.4 — sync never bypasses or defers posting); the `sync_applied_event` registry row commits INSIDE that transaction: duplicates replay the ORIGINAL result (one document ever), killed pushes roll back everything (retry applies exactly once — rejected outcomes are deliberately NOT recorded so a crashed device can retry, while conflicts ARE recorded so a business-conflicting sale can never be applied twice); conflicts (oversold stock under `reject`, stale conversion) return `conflict` + code for the device review queue. `GET /api/sync/pull` is a resumable committed-fact cursor over the transactional outbox.

**Web POS (offline-first, master prompt rule 13 — real, not mock):** keyboard-first POS (scan/search + Enter, product tiles, editable cart, split tenders, change due); commits online through `/sales/commit`; when the API is unreachable the sale is captured into an IndexedDB outbox with the SAME identity and drained on reconnect (applied/duplicate → removed; conflict/rejected → kept with the reason surfaced); unmistakable status indicator; web-PWA device identity for the sync registry; invoices/orders/payments/deposits/shifts pages; thermal-80mm/A4 receipt print from ONE payload (balance-owed = THIS invoice's due).

**RBAC additions:** `sales:read`, `sales:write`, `sales:pos`, `payment:read/write`, `shift:read/write/approve`, `sequence:manage`, `sync:device`. Cashier = the POS core (sell, receive money, own shift, sync); manager adds orders/fulfillments + variance review + booklet management; auditor read-only.

**Migration workstream (sales cycle):** `transform-phase3` imports orders+PWG mirrors (per so_code) → sales_order + lines + invoice + lines (server-computed totals, cost snapshot) → receipts (receipt-grouped, typed tenders with MoMo provider mapping, pro-rata allocations) → open-SO carryover (fulfilled counters + derived status) → waybills → deposits (negative invoice rows → customer_deposit + receipt, funding receipt REUSED — no double money) → credit applications (cash_deposit_disbursement) → quotations (proforma) → booklets (verbatim codes; closed→allocated WITH document linkage; not-used→spoilage with reason). Correction-aware rules: **D1** multi-account receipts reconstructed as `amount − amount_due − Σ disbursements` (payment rows are account evidence, not amounts; both the multi-account and multi-invoice signatures), **R14** header divergence (first-row-wins + record, emitted on every run so artifacts are stable), **R8** discount totals (server-computed from lines — the unstored discount is never invented). Fixture extended: clean cash sale, D1+R14+R8 credit sale with partial pick, deposit + disbursement, proforma, realistic booklets. Idempotency proven by re-run (zero imports, all targets reused, stable records); CLI smoke PASS (parsed-dump fallback; CI exercises MySQL).

## Verification summary (Phase 3)

| Check | Result |
|---|---|
| Domain unit tests (sales math, tenders, allocations, state machines + property sweep) | 36/36 total (20 new) |
| **Sales E2E: cash sale (invoice+stock+COGS+tender+allocation+audit+outbox verified in DB), credit sale, part payment ladder, deposit→allocation, receipt payload** | 10/10 |
| **Posting atomicity: kill mid-post (after deepest partial state) → ZERO partial rows** | ✅ |
| **Allocation invariants property-tested (API level, invariant 3/8)** | ✅ |
| **Booklet concurrency (3 simultaneous cashiers: ordered, unique, exhaustion → counter fallback)** | ✅ |
| **Shift expected-cash derivation + variance review gate (cashier 403)** | ✅ |
| **Financial hardening: tax evidence (exclusive/inclusive/mixed/exempt/effective-dating/immutability/atomicity)** | ✅ (17-test suite) |
| **Financial hardening: GL journals balanced ΣD=ΣC for sale/receipt/deposit/credit in the same transaction** | ✅ |
| **Financial hardening: AVCO cost layers, proportional issue cost, transfer value carry, rebuildable cost state** | ✅ |
| **Financial hardening: price authority + override evidence + server-verified supervisor approval thresholds** | ✅ |
| **Financial hardening: sync canonical payload fingerprint (key reuse = conflict)** | ✅ |
| **Performance: sub-second sale commit locally (median ≈ 50 ms)** | ✅ |
| **Offline sync chaos: duplicate delivery replays the ORIGINAL result; kill mid-push rolls back registry+documents (retry applies exactly once); two-terminal oversell → policy conflict / backorder+exception; lease validation (wrong device rejected); idempotencyKey dedupe; resumable pull** | 7/7 |
| **Migration smoke + Phase 3 sales-cycle import + idempotency re-run** | 10/10 |
| **CLI migration smoke (fixture → reconciliation.json)** | PASS (artifact: 9 quarantine, 9 correction records — 6 Phase 1/2 + 3 Phase 3: D1 multi-account, R14 divergence, R8 discount) |
| RBAC matrix + cross-tenant impossibility (extended with Phase 3 permissions) | 26/26 |
| Inventory invariants + trust boundary (Phase 2, unchanged) | 26/26 |
| Posting Coordinator atomicity + vertical slice E2E + migration guard | 16/16 |
| Lint / **clean** typecheck (no dist) / build (9 workspaces incl. web) | clean |
| npm audit (runtime) | 0 |

## Financial hardening round (independent review findings 1–5)

A focused correctness round on top of the delivered Phase 3, keeping every existing behaviour; additive migration `0007_phase3_financial_hardening.sql` (0006 history untouched).

- **F1 TAX (ADR-aligned, statute-free):** effective-dated, versioned tax profiles with NAMED components (rate + inclusive/exclusive treatment). No statutory rate is embedded anywhere — the seeded default profile has ZERO components (tax-neutral until configured). Every invoice stores immutable transaction-time evidence: profile version, per-component name/rate/basis/amount rows, per-line tax basis after pro-rata discount allocation, exempt applicability (product-level OR line-level). Deterministic exact-decimal math (single half-even rounding; the inclusive residual lands on the last component so Σ is always exact; exclusive components levy on the NET — a levy never taxes an embedded tax). Server-side resolution by the SERVER business date; a client never names a version. Rate changes = new version (the overlap guard + append-only component grants make in-place edits structurally impossible; creating an open-ended version closes the previous window the day before). Invoice identity is now `total = subtotal − order_discount + tax_total − tax_inclusive_total` (DB CHECK).
- **F2 GL (minimum synchronous primitives):** generic control chart + 10 purpose→account mappings seeded idempotently per tenant on first posting; append-only `journal_entry`/`journal_line` with ΣD=ΣC enforced TWICE (domain JournalBuilder pre-insert + DB constraint trigger re-deriving header totals at commit). One balanced journal per sale (revenue, per-component tax payable incl. per-component account overrides, tender control accounts, change, AR net of credit, deposits consumed, COGS/inventory) and per standalone receipt/deposit/credit application — all INSIDE the source transaction (kill-after-writes proof: no journal rows survive).
- **F3 COST (ADR-0004, AVCO):** effective-dated cost-policy versions (avco only in Phase 3); cost-bearing receipt layers on stock movements (`unit_cost`, `cost_value`); issues remove value proportionally to on-hand value; reversals copy evidence verbatim; transfers carry the dispatched value with the exact-residual convention (Σ transfer-in == transfer-out for any partial-receive sequence); `stock_cost_state` maintained inside the StockPoster's locked critical section and rebuildable from the ledger (rebuild job recomputes both projections); `invoice_line` stores method + policy version + unit cost + line COGS. Opening stock and cost-bearing adjustments accept optional unit costs; un-costed receipts are legal zero-value layers.
- **F4 PRICE AUTHORITY:** the server-resolved price is AUTHORITATIVE — a mismatched client price is a 409 stale-price unless the principal holds `sales:price_override` AND supplies recorded evidence (reason); material overrides beyond tenant-configured thresholds additionally require a supervisor whose credentials verify SERVER-SIDE inside the posting transaction (and who holds the permission themselves). Order discounts require `sales:discount_override` + evidence under the same threshold rule. Cashiers hold NEITHER permission by design. Offline override conflicts map to sync conflict codes (`stale_price`, `override_requires_approval`) for the device review queue.
- **F5 SYNC IDENTITY:** canonical-JSON payload fingerprint (SHA-256 over {type, payload} with sorted keys) stored on `sync_applied_event`; same key + same payload → duplicate replay of the original result; same key + DIFFERENT payload → `idempotency_key_reuse` conflict — never a silent second application. NULL fingerprints (pre-0007 rows) keep legacy duplicate semantics.
- **RBAC additions:** `sales:price_override`, `sales:discount_override` (manager+, never cashier), `tax:manage` (owner/admin/manager), `gl:read` (owner/admin/manager/auditor). New endpoints: tax profile/version admin + GL accounts/mappings/journals reads.
- **Latent bug fixed en route:** standalone `POST /api/credits/apply` used SELECT … FOR UPDATE on `customer_deposit`, for which the app role deliberately has no UPDATE grant (append-only ledger) — it could only 500 in production. Now serialized with the same transaction-scoped advisory-lock domain as the sale credit waterfall.
- **Proofs:** `apps/api/test/financial-hardening.integration.test.ts` — 17 tests covering every finding, plus unit suites for the tax/costing/GL/canonical domain modules (44 tests) and the updated RBAC matrix.

## Exit criteria check (ROADMAP Phase 3)

- [x] E2E cash sale, credit sale, part payment, deposit→allocation (sales-flows E2E)
- [x] E2E offline sale→sync chaos suite (duplicate delivery, kill mid-push, two-terminal oversell policy outcomes, lease validation, dedupe, resumable pull)
- [x] Allocation invariants property-tested (domain sweep + API-level sweep)
- [x] Posting-atomicity test: kill transaction mid-post → zero partial rows
- [x] Performance: sub-second sale commit locally (median ≈ 50 ms, well under 1 s)
- [x] Migrated invoices/payments reconcile with per-document correction records for D1/R8/R14-affected rows (every material diff flagged `requires_manual_approval` — never silently copied)

## Known limitations / deferred (deliberate)

- **Chart-of-accounts administration, statements and closing** arrive with the Phase 4 posting engine; the hardening round delivered the minimum synchronous GL primitives (generic control chart + purpose mappings seeded per tenant, append-only balanced journals committed in the sale/payment/deposit/credit transactions, DB constraint trigger re-deriving totals at commit). Journal lines for NON-sale inventory documents (adjustments/transfers/opening balances) and the back-fill for pre-hardening Phase 3 documents are Phase 4 work.
- Payment/receipt/deposit reversals are **new documents by design**; the reversal endpoints land with Phase 5 returns/credit notes (append-only grants already enforce it at the DB).
- Offline quota/stock leases (optional hard limits) remain a documented Phase 6 option; the current policy pair (reject/allow_backorder) covers the §5b outcomes.
- Web print goes through the browser; ESC/POS adapters, drawer kick and the device test screens are Phase 6 hardware hardening.
- The change-feed projection with per-tenant monotonic seq stays on the outbox-cursor protocol until the first relay consumer needs compaction.
- Quotation → order conversion imports proforma history; quotation printing (A4 proforma layout) arrives with the Phase 5 template gallery.

## Next actions (Phase 4 — Purchasing & accounting)

1. Phase 4 posting engine: chart-of-accounts administration, statements, closing; GL journals for non-sale inventory documents (adjustments/transfers/opening balances); back-fill GL + tax evidence for pre-hardening Phase 3 documents (identifiable by cost_method IS NULL with a purchase-price cost_at_sale).
2. PO/GRN/supplier invoice 3-way match; debit notes; AP payments/allocations (mirroring the Phase 3 allocation engine).
3. Banking (accounts, transfers, statement import + matching); AR/AP subledgers with control-account reconciliation job.
4. Migration: POs, GRNs, AP, banking references, chart of accounts; opening balances + opening trial-balance tie-out with the accountant sign-off.

---

