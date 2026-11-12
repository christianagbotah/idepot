# iDepot Modernization — Status Board

| | |
|---|---|
| **Current phase** | **Phase 6 (desktop/mobile/hardware) IN PROGRESS** on branch `phase-6/desktop-mobile-hardware` from merged `main` `0c7d66588312783548fedd607702381001a1ca8f` per `docs/PHASE6_ZAI_HANDOFF.md`. Track A (staging readiness assets) prepared — see `docs/staging/` and `scripts/deploy/`; deployment itself awaits the owner's authorized VPS channel (issue #10). No client cutover sign-off. |
| **Previous phases** | Phase 0 — forensic audit & architecture ✅ (merged); Phase 1 — monorepo foundation + migration engineering foundation ✅ (merged); Phase 2 — master data & inventory ✅ (merged); Phase 3 — sales & POS ✅ (hardened); Phase 4 — purchasing & accounting ✅ (hardened); Phase 5 — returns/reporting/admin ✅ (merged as `776d2eb`, reviews 5834590343 + 5852472160 addressed, pre-merge CI 146 unit + 397 integration) |
| **Branch** | `main` (Phases 0–5 integrated) + `phase-6/desktop-mobile-hardware` (draft PR — not to be auto-merged) |
| **Repo state** | Phase 6 delivered so far: hardware HAL + ESC/POS renderer (`packages/hardware`, 17 tests), canonical print templates (`packages/print-templates`, 10 tests), offline engine (`packages/offline`, 11 tests), device administration + migration 0021 + sync revocation guard (5 integration tests), Tauri 2 desktop scaffold, React Native scaffold, 50-terminal chaos benchmark **PASS** (196/196 applied, stock+cash exact, revoked terminal refused), staging deploy/backup/rollback scripts + synthetic seeder + 16-check UAT harness (validated 16/16 against a locally deployed release), and the `cogs_vs_stock_ledger` control fix (restocking returns previously failed the check by exactly the restocked cost). Suites: **184 unit + 405 integration** (baselines 146/397 preserved). Installers/store builds are SOURCE-READY ONLY — no Windows/macOS/Android/iOS artifact is claimed without host-runner evidence. |

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
- State machines: quotation (draft → issued → accepted → converted, with rejected | expired as dead ends and manual cancel before conversion — review hardening P1-3; evidence columns `issued_at`/`accepted_at`/`status_reason`, validity-window guards, conversion requires acceptance), sales order (draft→confirmed→partially_fulfilled→fulfilled→closed; cancel only before confirmation), fulfillment (draft→dispatched→delivered), shift (open→closed).

**Schema (migration 0006):** document_sequence + pre-printed booklets (verbatim codes, allocated IN ORDER under FOR UPDATE, first-class spoilage with mandatory reason) + offline sequence_lease; cashier_shift + cash movements; quotation/sales_order/fulfillment (+ `fulfilled ≤ ordered` CHECK); invoice/invoice_line (server totals, cost_at_sale snapshot, price-resolution evidence, client_doc_id uniqueness); append-only payment/payment_tender/payment_allocation/customer_deposit/credit_application (reversals are new documents — the legacy destructive edits are structurally impossible); `payment_allocation_guard` constraint trigger enforcing invariant 8 at the DB; sync_applied_event idempotency registry; tenant_config oversell policy; tenant-aware composite FKs; stock_balance CHECK relaxed to a sanity bound per offline-sync §5b (the 0004 fail-loud gate was explicitly "until Phase 3"); legacy_raw sales-cycle staging.

**Sale posting core (SalePoster — the ROADMAP Phase 3 atomic set):** ONE UnitOfWork transaction commits invoice + lines (with per-line exemption-source evidence) → TAX EVIDENCE (effective-dated profile version resolved server-side by the transaction date; per-component name/rate/basis/amount rows; deterministic exact-decimal math) → stock issue movements (via StockPoster: configured conversion authority, deterministic balance locking) → COGS per AVCO (ADR-0004: method + policy version + unit cost + line COGS stored on the line; `stock_cost_state` maintained inside the StockPoster's locked critical section) → money tenders as a payment document + explicit allocation → credit tenders as credit applications (advisory-lock waterfall, append-only deposits) → ONE balanced GL journal (revenue, per-component tax payable, tender control accounts, change, AR, deposits consumed, COGS/inventory — JournalBuilder + DB constraint trigger both enforce ΣD=ΣC) → audit event + outbox (`InvoicePosted`/`PaymentReceived`/`CreditApplied`/`StockMoved`/`SaleBackorderException` — committed facts only). Any throw rolls back the WHOLE set (proven by the deep atomicity suite across 15 projections and three failure depths). Oversell policy per tenant: `reject` (default; 409) | `allow_backorder` (ledger applies, prominent exception task raised INSIDE the posting tx).

**Payments & credit:** standalone receipts (typed tenders + explicit allocations, FIFO-optional but always written as rows); deposits; apply-credit with due/remaining validation; customer balance query.

**Orders & delivery:** quotations (proforma successor), sales orders — confirmation posts the invoice for the full order (legacy semantics) via the SalePoster set; fulfillments/waybills track the physical handover of already-sold goods with over-promise (in-flight + delivered ≤ ordered) and over-delivery guards; delivery advances the fulfilled counters and derives the order status.

**Document numbering:** counter sequences (row-locked `UPDATE … RETURNING` — legacy R6 race killed), booklet-first allocation for INVOICE/WAYBILL (pre-printed stock constraint; READ COMMITTED re-evaluation makes concurrent cashiers get different codes), spoilage, offline leases (expiry-bounded ranges validated at sync).

**Offline sync engine (server):** `POST /api/sync/push` applies each event in EXACTLY one PG transaction through the SAME posting coordinator as online commands (offline-sync §4.4 — sync never bypasses or defers posting). CONCURRENCY-SAFE IDEMPOTENCY (final-review blocker #1): the transaction first CLAIMS the event's idempotency domain with transaction-scoped advisory locks over BOTH registry identities (event id + tenant/idempotency-key, fixed acquisition order — deadlock-free, released automatically at commit/rollback so a crash never leaks its claim), then re-reads `sync_applied_event` UNDER the claim, then posts and writes the registry row in the SAME transaction. Two simultaneous deliveries of the same event or key serialize at the transaction boundary and converge deterministically: duplicates replay the ORIGINAL result (one document ever); the same key with a DIFFERENT payload is `idempotency_key_reuse`; killed/crashed pushes roll back everything including the claim (retry applies exactly once — rejected outcomes are deliberately NOT recorded so a crashed device can retry, while conflicts ARE recorded, race-proof, so a business-conflicting sale can never be applied twice); conflicts (oversold stock under `reject`, stale conversion, unbacked exemptions) return `conflict` + code for the device review queue. No caller can ever surface a raw 23505 or a generic internal error for a legitimate retry race (proven by true `Promise.all` races over real HTTP/PG). `GET /api/sync/pull` is a resumable committed-fact cursor over the transactional outbox.

**Web POS (offline-first, master prompt rule 13 — real, not mock):** keyboard-first POS (scan/search + Enter, product tiles, editable cart, split tenders, change due); commits online through `/sales/commit`; when the API is unreachable the sale is captured into an IndexedDB outbox with the SAME identity and drained on reconnect (applied/duplicate → removed; conflict/rejected → kept with the reason surfaced); unmistakable status indicator; web-PWA device identity for the sync registry; invoices/orders/payments/deposits/shifts pages; thermal-80mm/A4 receipt print from ONE payload (balance-owed = THIS invoice's due).

**RBAC additions:** `sales:read`, `sales:write`, `sales:pos`, `payment:read/write`, `shift:read/write/approve`, `sequence:manage`, `sync:device`. Cashier = the POS core (sell, receive money, own shift, sync); manager adds orders/fulfillments + variance review + booklet management; auditor read-only.

**Migration workstream (sales cycle):** `transform-phase3` imports orders+PWG mirrors (per so_code) → sales_order + lines + invoice + lines (server-computed totals, cost snapshot) → receipts (receipt-grouped, typed tenders with MoMo provider mapping, pro-rata allocations) → open-SO carryover (fulfilled counters + derived status) → waybills → deposits (negative invoice rows → customer_deposit + receipt, funding receipt REUSED — no double money) → credit applications (cash_deposit_disbursement) → quotations (proforma) → booklets (verbatim codes; closed→allocated WITH document linkage; not-used→spoilage with reason). Correction-aware rules: **D1** multi-account receipts reconstructed as `amount − amount_due − Σ disbursements` (payment rows are account evidence, not amounts; both the multi-account and multi-invoice signatures), **R14** header divergence (first-row-wins + record, emitted on every run so artifacts are stable), **R8** discount totals (server-computed from lines — the unstored discount is never invented). Fixture extended: clean cash sale, D1+R14+R8 credit sale with partial pick, deposit + disbursement, proforma, realistic booklets. Idempotency proven by re-run (zero imports, all targets reused, stable records); CLI smoke PASS (parsed-dump fallback; CI exercises MySQL).

## Verification summary (Phase 3 — current head)

| Check | Result |
|---|---|
| Domain unit tests (sales math, tenders, allocations, state machines, tax, costing, GL, decimal, canonical, auth) | 83/83 |
| **Sales E2E: cash sale (invoice+stock+COGS+tender+allocation+audit+outbox verified in DB), credit sale, part payment ladder, deposit→allocation, receipt payload, deposit-repeat regression** | 11/11 |
| **Deep posting atomicity: failure AFTER the deepest financial writes → all 15 projections (invoice, invoice_line, invoice_tax_component, stock_movement, stock_balance, stock_cost_state, payment, payment_tender, payment_allocation, credit_application, journal_entry, journal_line, audit_event, outbox_event, sync_applied_event) return EXACTLY to the pre-failure baseline — full row snapshots, not counts; three failure depths (direct kill-after-writes, sync kill-after-writes+registration, crash-before-commit) + non-vacuity proof** | 4/4 ✅ |
| **Allocation invariants property-tested (API level, invariant 3/8)** | ✅ |
| **Booklet concurrency (3 simultaneous cashiers: ordered, unique, exhaustion → counter fallback)** | ✅ |
| **Shift expected-cash derivation + variance review gate (cashier 403)** | ✅ |
| **Financial hardening: tax evidence (exclusive/inclusive/mixed/exempt/effective-dating/immutability/atomicity)** | ✅ (17-test suite) |
| **Financial hardening: GL journals balanced ΣD=ΣC for sale/receipt/deposit/credit in the same transaction** | ✅ |
| **Financial hardening: AVCO cost layers, proportional issue cost, transfer value carry, rebuildable cost state** | ✅ |
| **Financial hardening: price authority + override evidence + server-verified supervisor approval thresholds** | ✅ |
| **Financial hardening: sync canonical payload fingerprint (key reuse = conflict)** | ✅ |
| **Review hardening: server-authoritative tax applicability, invoice reversal in ONE transaction, quotation lifecycle with evidence, composite tenant FKs** | ✅ (12-test suite) |
| **Performance — FULL synchronous posting path benchmark (tax + AVCO + stock + payment/allocation + credit waterfall + GL + audit + outbox, NOTHING mocked; 50 samples + 8 warmup per scenario, environment recorded): cash sale p50 13.4 ms / p95 33.7 ms / max 42.4 ms; credit sale (deposit + part cash + AR) p50 12.4 ms / p95 31.9 ms / max 69.9 ms** | ✅ p50 < 1000 ms gate (artifact: `benchmarks/sale-posting/results/latest.json`) |
| **Offline sync chaos: duplicate delivery replays the ORIGINAL result; kill mid-push rolls back registry+documents (retry applies exactly once); two-terminal oversell → policy conflict / backorder+exception; lease validation; idempotencyKey dedupe; resumable pull; TRUE CONCURRENCY races (Promise.all over real HTTP/PG): same key+same payload converges on one application and one result, same eventId+same payload converges, same key+different amount/product/event type → exactly one effect + `idempotency_key_reuse`, crash after claim+writes+registration but before commit → nothing durable, retry after the crashed transaction applies exactly once — never a raw 23505, never a generic internal result** | 14/14 |
| **Migration smoke + Phase 3 sales-cycle import + idempotency re-run** | 10/10 |
| **CLI migration smoke (fixture → reconciliation.json; migrations 0001–0008 from zero)** | PASS (artifact: 9 quarantine, 9 correction records — 6 Phase 1/2 + 3 Phase 3: D1 multi-account, R14 divergence, R8 discount) |
| RBAC matrix + cross-tenant impossibility (all Phase 3 permissions incl. exemption override + reversal) | 37/37 |
| Inventory invariants + trust boundary (Phase 2, unchanged) | 26/26 |
| Posting Coordinator atomicity + vertical slice E2E + migration guard | 16/16 |
| Lint / **clean** typecheck (no dist) / build (9 workspaces incl. web; **zero ESLint configuration failures — `next/core-web-vitals` + `next/typescript` load and run for real**) | clean |
| npm audit (runtime: 0 high/critical; all chains incl. dev: 0 critical) | PASS |

Integration total: **155/155** (14 files). Unit total: **83/83** (7 files).

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

## Review hardening round (second independent review, blockers 1–4 @ head 0c749eb)

A second focused round on top of the financial hardening, again keeping every existing behaviour; additive/corrective migration `0008_phase3_review_hardening.sql` (0001–0007 history untouched).

- **P0-1 TAX APPLICABILITY IS SERVER-AUTHORITATIVE:** exemption now resolves from server configuration ONLY — `product.tax_exempt`, the new `customer.tax_exempt`, or a separately permissioned + audited override (`sales:tax_exempt_override`, manager+; recorded reason). The client's `taxExempt` flag became an EXPECTATION: with no server source it is a fail-closed 409 (`tax_exemption_unbacked` sync conflict code for the offline review queue) — a client payload can never suppress tax. Every `invoice_line` stores the transaction-time exemption SOURCE evidence (`tax_exemption_source` ∈ product|customer|override, plus the override reason). Cashiers hold no exemption override power by design.
- **P0-2 INVOICE REVERSAL:** append-only `invoice_reversal` correction documents (reason mandatory 10–500 chars, ONE reversal per invoice by DB UNIQUE, idempotent retry by `client_doc_id`, own `INVOICE_REVERSAL` numbering space). ONE UnitOfWork transaction inverses everything the sale committed: stock/AVCO via `reversal` movements linked `reversal_of` the original issues — the StockPoster copies the original `(unit_cost, cost_value)` VERBATIM so quantity and value layers return exactly (`uq_stock_movement_reversal_of` makes double reversal structurally impossible); GL via a reversal journal that inverts the original sale journal per account (opposite sides on the same account net to one one-sided line — JournalBuilder invariant); AR via one extra pair (DR receivable / CR deposits) that clears the value settled by LATER standalone receipts and credit applications; the total restored value (sale-time credit + later settlements) lands as ONE new append-only `customer_deposit` row linked through `restored_deposit_id`. The sale/later payment/allocation rows stay as committed facts — the accounting inverse lives in the journals, the subledger restoration in the deposit. Pre-hardening invoices without a sale journal are refused with a pointer to the documented Phase 4 back-fill. Endpoint: `POST /api/sales/invoices/:id/reverse` (`sales:reverse_invoice`, manager+) + evidence read-back.
- **P1-3 QUOTATION LIFECYCLE:** draft → issued → accepted → converted, with rejected | expired as documented dead ends and a manual cancel any time before conversion. `issued_at`/`accepted_at` recorded as evidence; `status_reason` mandatory on reject, defaulted on expiry (`validity period elapsed`), optional on cancel. Validity-window guards: an offer past `valid_until` can no longer be issued, accepted or converted (node-postgres DATE handling covered — the guard reads the JS Date, not a string slice). Conversion now REQUIRES acceptance (a bare draft is a 400). Endpoints: `POST /api/quotations/:id/{issue,accept,reject,expire}` (`sales:write`).
- **P1-4 TENANT-REFERENCE HARDENING:** every remaining plain single-column entity FK on the Phase 3 financial schema is replaced by the Phase 2 composite `(tenant_id, ref)` defense-in-depth pattern (constraint swap located by (table, column, target), so it is robust to naming variance; ON DELETE CASCADE semantics preserved exactly; the redundant plain twins that 0006/0007 had left beside composite ones are dropped). A tenant-A row can no longer reference tenant-B financial rows even at the raw DB boundary where FK checks bypass RLS — proven behaviorally (cross-tenant `payment_allocation` insert rejected by the composite FK under a superuser connection that ignores RLS).
- **RBAC additions:** `sales:tax_exempt_override`, `sales:reverse_invoice` (manager+; never cashier/auditor) — auth matrix extended.
- **Bug fixed en route (both found by the new integration suite):** (1) the reversal journal first aggregated opposite sides onto one two-sided line — JournalBuilder (rightly) requires one-sided positive lines, so opposite sides now NET before posting; (2) `invoice_reversal` is append-only by grant design, so the reversal row is now INSERTED LAST with `journal_entry_id`/`restored_deposit_id` already resolved instead of patching them with an UPDATE the app role cannot perform.
- **Proofs:** `apps/api/test/review-hardening.integration.test.ts` — 12 tests: exemption source evidence (product/customer/override), fail-closed client expectation 409, override-without-permission 403, full cash-sale reversal (status + stock + AVCO value restored exactly + verbatim cost evidence + per-account journal inversion), credit-sale reversal with later receipts AND later credit applications (AR cleared to zero, restored deposit = C + T2 + C2, per-account inversion + clearing pair), idempotent `client_doc_id` replay, one-reversal-per-invoice, authority/validation guards (cashier/auditor 403, short reason 400, missing sale journal 409), the full quotation lifecycle with evidence columns, reject/expire/cancel outcomes with reasons, the composite-FK catalog assertion, and the cross-tenant FK rejection. Domain machine unit tests extended; auth permission matrix extended.

## Final hardening round (third independent review, blockers 1–5)

The last focused round on the same head, preserving every existing behaviour; NO schema change was required (0001–0008 stand untouched — the fixes are transaction protocol, dependency, proof and documentation).

- **B1 OFFLINE IDEMPOTENCY CONCURRENCY:** `SyncService.applyEvent` previously did an unlocked SELECT pre-check, posted, then bare-INSERTed the registry row — two simultaneous deliveries of the same idempotency key could both pass the SELECT, and the loser surfaced a raw PostgreSQL 23505/generic error instead of the deterministic idempotency outcome. Now the apply transaction CLAIMS the idempotency domain FIRST: transaction-scoped `pg_advisory_xact_lock` over BOTH registry identities (the event id and the tenant/idempotency-key pair — the repo-wide md5-derived bigint idiom, fixed acquisition order making deadlock structurally impossible, released automatically at commit/rollback so a crash never leaks its claim). Under the claim it RE-READS the registry, compares the canonical payload fingerprint (same → `duplicate` replaying the ORIGINAL result; different → `idempotency_key_reuse`; NULL → legacy semantics), posts the business documents and writes the registry row IN THE SAME transaction. Conflict-evidence recording is race-proof too (same claim + untargeted `ON CONFLICT DO NOTHING` + contained failures). Proofs — the chaos suite grew 7→14 with TRUE `Promise.all` races over real HTTP/PG: same key+same payload → ONE application, both callers converge on the identical result; same eventId+same payload → same convergence; same key+different amount / different product / different event type → exactly one effect commits and the loser gets `idempotency_key_reuse`; crash after claim+writes+registration but BEFORE COMMIT → nothing durable; retry after the crashed transaction → applies exactly once then replays as duplicate. No caller ever receives a raw 23505 or a generic rejected/internal result for a legitimate retry race.
- **B2 ESLINT/NEXT CONFIGURATION (fixed for real):** `apps/web` referenced `next/core-web-vitals` + `next/typescript` but `eslint-config-next` was not installed anywhere — every `next build` printed `ESLint: Failed to load config "next/core-web-vitals" to extend from.` Now `eslint-config-next@15.5.28` (pinned EXACT to the locked next version) + `eslint` are apps/web devDependencies (lockfile committed; `npm ci` clean). The config loads and the rules RUN during `next build` — proof: the newly-active `react-hooks/exhaustive-deps` rule flagged a real dependency bug in the POS outbox drain, which was fixed PROPERLY (latest-ref pattern: the reconnect effect still fires only on connectivity/device changes while always draining with the current session/queue — trigger semantics unchanged, nothing suppressed). Fresh build logs contain ZERO occurrences of the failure string.
- **B3 REPRODUCIBLE PERFORMANCE EVIDENCE (full path, nothing mocked):** dedicated benchmark suite (`sale-posting-benchmark.integration.test.ts`) drives the REAL synchronous posting path — tax resolution + per-component evidence (exclusive AND inclusive), AVCO layers + cost state, stock ledger, payment + tenders + allocations, deposit credit waterfall, GL journal, audit, outbox — with real configured tax components and cost-bearing stock. Per scenario: 8 warmup + 50 measured sequential commits, `performance.now()` timings, p50/p95/max/min/mean, full environment context (Node 24.22.1, PostgreSQL 18.4 embedded, 2× Xeon, 4 GB). **Cash sale: p50 13.4 ms, p95 33.7 ms, max 42.4 ms. Credit sale (deposit credit + part cash + AR): p50 12.4 ms, p95 31.9 ms, max 69.9 ms.** The Phase 3 gate (a normal local sale commit below 1 second) is asserted at p50 < 1000 ms with ~75× headroom. Committed artifact: `benchmarks/sale-posting/results/latest.json` (regenerated on every run; the repo convention of orm-bench).
- **B3 BONUS — REAL PRODUCTION BUG FOUND AND FIXED:** the benchmark's repeated credit sales crashed with a 500 on the SECOND application from a previously-used deposit: `applyCreditWaterfall` parsed `SUM(numeric)::text` (`"20.0000"`) with `BigInt()`, which cannot parse decimal strings — latent because the FIRST application sees an empty aggregate (empty map, no conversion). Every repeat customer spending deposit credit twice was broken. Fixed with `parseMoney` (the repo's exact scaled-decimal parser); pinned by a named regression test in the sales-flows suite plus the benchmark's 50 consecutive credit sales.
- **B4 DEEP ATOMICITY PROOF:** the failure-injection test now proves that a failure AFTER the deepest financial writes leaves NO partial state, as an EXACT before/after comparison over all 15 projections (invoice, invoice_line, invoice_tax_component, stock_movement, stock_balance, stock_cost_state, payment, payment_tender, payment_allocation, credit_application, journal_entry, journal_line, audit_event, outbox_event, sync_applied_event) — full canonical row snapshots (not counts), with legitimate pre-test state seeded in every table first (successful direct sale + sync sale + standalone payment, with tax components, AVCO, deposit consumption, journals, audit, outbox). Three failure depths: direct kill-after-writes, sync kill-after-writes+registration, and crash-after-claim-before-commit — each returns every table byte-for-byte to the baseline; a final clean commit proves the comparator is not vacuous.
- **OPERATIONAL HARDENING en route:** unexpected 500s are now ALWAYS logged server-side with the stack (`DomainExceptionFilter`) — the wire response stays opaque, but operations can never lose the cause (this is what surfaced the B3 bug's stack in seconds).
- **B5 DOCUMENTATION:** PR description rewritten to the true state; this STATUS board reconciled end-to-end (early paragraphs no longer describe the pre-hardening posting/cost model or the old quotation lifecycle; counts and CI evidence current).

## Exit criteria check (ROADMAP Phase 3)

- [x] E2E cash sale, credit sale, part payment, deposit→allocation (sales-flows E2E)
- [x] E2E offline sale→sync chaos suite (duplicate delivery, kill mid-push, two-terminal oversell policy outcomes, lease validation, dedupe, resumable pull, TRUE concurrency races, crash-before-commit, retry-after-crash)
- [x] Allocation invariants property-tested (domain sweep + API-level sweep)
- [x] Posting-atomicity: deep proof across all 15 projections at three failure depths (exact baseline equality, not counts)
- [x] Performance: FULL posting path benchmark, nothing mocked — cash p50 13.4 ms / credit p50 12.4 ms (gate: < 1000 ms; artifact committed)
- [x] Migrated invoices/payments reconcile with per-document correction records for D1/R8/R14-affected rows (every material diff flagged `requires_manual_approval` — never silently copied)
- [x] Review hardening: tax applicability server-authoritative with source evidence; invoice reversal in ONE transaction; quotation lifecycle with evidence columns; composite tenant FKs on the whole Phase 3 financial schema
- [x] Final hardening: concurrency-safe sync idempotency (advisory-lock claim, deterministic races); ESLint/Next configuration genuinely fixed; reproducible full-path performance evidence (155 integration / 83 unit)

## Known limitations / deferred (deliberate)

- **Chart-of-accounts administration, statements and closing** arrive with the Phase 4 posting engine; the hardening round delivered the minimum synchronous GL primitives (generic control chart + purpose mappings seeded per tenant, append-only balanced journals committed in the sale/payment/deposit/credit transactions, DB constraint trigger re-deriving totals at commit). Journal lines for NON-sale inventory documents (adjustments/transfers/opening balances) and the back-fill for pre-hardening Phase 3 documents are Phase 4 work.
- Payment/receipt/deposit reversals are **new documents by design** and land with Phase 5 returns/credit notes (append-only grants already enforce it at the DB). INVOICE reversal is delivered (review hardening P0-2); its cash refund does NOT write a `shift_cash_movement`: a same-shift refund surfaces as a count variance at close for supervisor review (the reversal code is the evidence), and post-close reversals are back-office corrections in the GL.
- Offline quota/stock leases (optional hard limits) remain a documented Phase 6 option; the current policy pair (reject/allow_backorder) covers the §5b outcomes.
- Web print goes through the browser; ESC/POS adapters, drawer kick and the device test screens are Phase 6 hardware hardening.
- The change-feed projection with per-tenant monotonic seq stays on the outbox-cursor protocol until the first relay consumer needs compaction.
- Quotation → order conversion imports proforma history; quotation printing (A4 proforma layout) arrives with the Phase 5 template gallery. Offline devices do not carry quotation lifecycle events (they are online counter workflows); the sync event set stays sale/payment/deposit/customer.

## Completed capabilities (Phase 4 — this branch)

**Accounting foundation.** Chart of accounts with statement classes
(8 canonical classes), parent hierarchy with cycle guard, normal balance,
posting/non-posting and control designations, effective dates and safe
deactivation only (blocked while financial evidence references the
account). Purpose catalog widened from 10 to 22 posting purposes (the second
review round added `inventory_in_transit`) — the posting engine resolves
accounts by purpose, never by hard-coded ids.
Accounting periods (fiscal monthly, overlap-guarded) with
open/soft-closed/closed + audited reopen; the period lock is enforced at
the single journal choke point so EVERY financially coupled document
inherits it (corrections may post into soft-closed periods, never closed).
Journal entries gained business date, document reference and append-only
reversal linkage. GL inquiry with date/account/source/reference filters
and pagination; account-ledger drilldown; approved manual journals with
live balance preview and reversal-as-new-entry.

**Purchasing.** Full corrected lifecycle: purchase orders (draft→submitted
→approved→issued→partially_received→received→closed/cancelled) as pure
commitment documents; GRNs as the stock authority (AVCO layers at receipt
cost, Dr Inventory / Cr GR-IR in the same transaction, over-receipt
tolerance with verified supervisor approval); supplier invoices as the AP
authority with the PO↔GRN↔invoice 3-way match (price/quantity evidence,
configurable tolerances, exception approval — never a silent invoice
rewrite; invoice-before-receipt structurally prevented). PPV posts
explicitly; inventory is never re-valued at invoice time. Recoverable vs
non-recoverable purchase tax with transaction-time evidence.

**AP subledger.** Supplier payments with tenders (cash/momo/cheque/bank via
each bank account's own GL account) and explicit allocations serialized by
per-invoice advisory locks; advances (unapplied remainders) and later
application; append-only debit/credit notes (stock returns at AVCO cost in
the same transaction); AP aging (current/1-30/31-60/61-90/90+) and supplier
statements regenerated from documents with running balances. The open AP is
always ledger/allocation-derived — never a mutable snapshot.

**Banking.** Bank account master FK'd to the chart; transfers with explicit
fees (balanced journals, duplicate client-doc protection); statement import
treating uploads as untrusted input (5MB/20k-line bounds, strict per-field
validation, parameterized SQL only) with file-sha256 + per-line identity
dedupe; deterministic match suggestions (exact amount, opposite direction,
±3-day window, reference-boosted confidence) that NEVER auto-post; manual
match/unmatch with direction and amount guards and split support;
reconciliation finalization recording explicit GL-vs-statement differences.

**Financial statements.** Trial balance (opening + period + closing, ties to
the BS by construction), accrual P&L (COGS reconciles with the AVCO stock
ledger — never supplier payments), balance sheet (Assets = Liabilities +
Equity with real equity accounts and current earnings), and the indirect
cash flow with a documented canonical method
(docs/accounting/cash-flow-method.md) asserting
netCashFromOperations == netCashMovement (unexplained must be zero).
AR/AP/deposit/advance/COGS control reconciliation surfaces differences
explicitly — no plugs.

**GL backfill (idempotent).** Journals for non-sale inventory documents
(opening stock, adjustments, count variances), pre-hardening Phase 3
invoices/payments/deposits/credit applications, and party opening
balances — keyed by the journal unique constraint with pre-loaded skip
sets (a second run posts nothing).

**Migration workstream.** Legacy purchase orders (collapsed PO+GRN+
invoice, R14 per-row duplication) → PO + lines + server-computed supplier
invoices + historical payments/allocations; legacy accounts
(chart-as-payment-methods) → the corrected banking master with
snapshot-drift evidence; supplier opening balances → explicit documents;
legacy journals counted and reconcined as REFERENCE ONLY (D8/D9); the
opening trial balance posted from canonical documents with the explicit,
quantified equity plug requiring accountant sign-off (workflow exercised
on the fixture). Reruns are idempotent — one opening TB per tenant, ever.

**Web UI.** Thirteen responsive screens: purchase orders, GRNs, supplier
invoices with match review, supplier payments, debit/credit notes, AP
aging + statements, chart of accounts, journal inquiry + manual journals,
periods & close (+ backfill trigger), financial reports (P&L/BS/TB/CF),
control reconciliation, bank accounts, transfers, statement import &
matching — with ₵ money formatting and role-aware navigation (the server
remains the authorization authority).

**RBAC.** purchasing/receiving/ap/accounting/banking/financial-report
permissions plus the accountant and procurement roles; 84-case
authorization matrix including negative and cross-tenant cases.

**Posting rules** for every document type are documented in
docs/accounting/posting-rules.md.

**Second independent review round (accounting corrections, blockers 1–5).**
The holistic review of the Phase 4 accounting engine found five material
defects the existing tests did not exercise; all are fixed and pinned by a
dedicated 36-test regression suite (real API/DB evidence, exact expected
totals — never "the endpoint responded"):

- **BLOCKER 1 — cash-flow signs & classification.** The indirect build-up
  pushed credit-normal LIABILITIES with the raw debit−credit, so an unpaid
  GRN reported its GR/IR funding as −100 instead of +100 (net cash movement
  misstated whenever working capital moved), and equity financing was mixed
  into `netCashFromOperations`. Rebuilt from the ledger identity
  Σ(debits−credits)=0: every non-cash balance-sheet account contributes
  `credit − debit` (assets negative when growing, liabilities positive,
  equity positive), classified into OPERATING (net profit + working
  capital), INVESTING (purpose-designated long-lived assets; honestly empty
  in the seed chart) and FINANCING (equity class — injections positive,
  distributions negative). `netIncreaseDecreaseInCash` = the three
  activities summed, and the statement now also reports opening/closing
  cash & equivalents, reconciling EXACTLY to the direct ledger Σ over the
  configured cash accounts (unexplained surfaced, never plugged). Proven by
  a 12-scenario E2E timeline (unpaid GRN → invoiced → partially paid →
  settled, deposits received/consumed, supplier advance, capital injection,
  owner distribution, bank-to-bank transfer + fee, operating expense,
  purchase + sale) asserting exact totals at every milestone.
- **BLOCKER 2 — reconciliation sign normalization & posted-only scope.**
  `controlBalance` normalizes the GL movement by the control account's
  configured `normal_balance` (credit-normal AP/deposits present as
  positive liabilities; debit-normal AR/advances stay as-is; linear
  formula so REVERSING balances still reconcile exactly), and the AP
  subledger now counts only authoritatively POSTED invoices
  (posted/partially_paid/paid) plus their as-of-dated corrections,
  allocations and standalone notes — a pending_match invoice (which has no
  AP journal) moves NEITHER side. Adjustments against unposted invoices are
  refused outright (409) so no AP evidence can exist without its invoice.
  Nine scenarios pinned with exact control == subledger values.
- **BLOCKER 3 — synchronous GL posting + period locks for inventory
  documents.** Stock adjustments, count variances, write-offs, opening
  stock and internal transfers now post their journals INSIDE the posting
  transaction through the StockPoster (per-movement journals keyed
  `source_kind='stock_movement'`/movement id — the unique constraint makes
  double-posting structurally impossible): Dr Inventory / Cr adjustment
  gains for upward movements, Dr shrinkage & write-offs / Cr Inventory for
  downward ones, Cr opening-balance equity for `opening_balance`, and
  reversal movements MIRROR the original movement's counterpart account
  (a reversed write-off never books a fictitious gain). Transfers move the
  carried AVCO value inventory ↔ `inventory_in_transit` (new purpose 1210)
  — value-preserving, zero P&L by construction (proven). The backfill
  skips movements that already carry a synchronous journal, so it remains
  a historical-gaps tool only (idempotency re-proven). Accounting-period
  enforcement is inherited at the journal choke point AND serialized
  against closes with a per-period advisory lock (posting takes it SHARED,
  closing EXCLUSIVE — the concurrent close/posting race is deterministic
  and tested: a close can never slip under a passed check, and a poster
  that waits out a close re-reads the status and is rejected). Deep
  rollback re-proven across stock balance, cost state, GL, audit and
  outbox.
- **BLOCKER 4 — as-of correctness everywhere.** AP aging, customer-deposit
  and supplier-advance reconciliation, and the COGS↔ledger check now cut
  every document, allocation and application at its own authoritative
  business/posting date (applications take effect on the payment's journal
  date; credit applications on their own posting date — never the
  deposit's; future events cannot leak backwards). Timeline tests on three
  distinct dates per family: AP 100 → 40 → 0 (Oct 1/10/20), deposits
  200 → 50, advances 80 → 40, COGS 0 → equal-at-every-cut. Two chronology
  guards make the windows trustworthy at WRITE time: a payment/allocation
  may not predate its invoice's document date, and a note may not predate
  the invoice it corrects.
- **BLOCKER 5 — supplier statement double-count.** The statement folded
  debit/credit notes into the invoice row AND unioned them again as
  separate rows. Now the invoice row carries the original posted value
  exactly once, each note appears once on its own business date, each
  payment allocation once on the payment's date, only posted invoices
  appear, standalone notes appear as their own documents, and the
  unapplied advance remainder is reported SEPARATELY (`advanceBalance` —
  an asset, not a payable). The closing balance reconciles exactly with
  the canonical AP equation AND the normalized GL control at every
  before/between/after checkpoint.
- **Holistic defects fixed on top of the five:** AP-aging bucket mapping
  crashed with `money "undefined"` for ANY invoice 1–90 days past due (the
  raw bucket label was used as the DTO key); the aging now omits
  fully-settled suppliers instead of presenting all-zero rows; the
  COGS↔ledger check subtracts reversal movements symmetrically with the
  compensating reversal journals (previously a reversed sale broke the
  check); the reconciliation JOIN now derives `normal_balance` correctly
  under aggregation.

## Verification summary (Phase 4 — current head)

- 121 unit tests + 315 integration tests green, including the NEW 21-test
  advance/AR-reversal suite (review round 3 + the round-4 idempotency and
  conservation adversarial additions), the 36-test financial-corrections
  suite (12 cash-flow scenarios, 9 reconciliation scenarios, 8
  synchronous-posting/period-lock/rollback tests, 4 as-of timelines, 4
  statement-chronology tests), 16 purchasing E2E, 8 concurrency/atomicity with
  full-table snapshot proofs, 12 accounting statements/periods/backfill, 8
  banking, 11 migration smoke incl. rerun idempotency, 84 RBAC matrix cases, 6
  independent-review regressions, plus all Phase 1–3 suites.

- Independent final review round (blockers fixed at head):
  - **AP status truthfulness** — the payment status is recomputed from
    the canonical AP equation (`paid ⟺ open ≤ 0`) by one shared
    `refreshInvoiceStatus` helper used by payments, advance application
    and debit/credit notes. Previously an allocation greater than HALF
    the open balance marked the invoice `paid` prematurely (60 of 100 →
    `paid` with 40 open), advance application never refreshed the status,
    and adjustments never re-evaluated it (pinned by 4 regression tests).
  - **GR/IR proration** — a partial-quantity (progress-billed) supplier
    invoice clears only the BILLED PROPORTION of the receipt accrual
    (`round4(billed qty × receipt cost)`, the exact GRN basis) and PPV
    is measured on that proportion; previously the FULL GRN line value
    was debited, destroying the accrual for uninvoiced goods and booking
    a fictitious favourable price variance (pinned by 2 regression tests).
  - **`supplier_payment.bank_account_id`** now carries the composite
    tenant FK to `bank_account` (house pattern; previously the only
    cross-document reference without one), and the bank-tendered payment
    path (bank's OWN GL account, inactive-account refusal) is tested.
- Review round 3 (supplier advance lifecycle + reversal-aware AR):
  - **Supplier advance applications are dated documents** — an advance paid
    Oct 1 can be applied to an invoice dated Oct 20 (the advance was paid
    BEFORE the goods existed). Each application is an append-only
    `supplier_advance_application` document (independent ID/code `SAA…`,
    composite tenant FKs, APPLICATION business date, client idempotency
    identity, journal linkage, created-by/approved-by evidence, audit +
    outbox) written in the same UnitOfWork transaction as its journal
    (Dr AP / Cr supplier advances) booked on the APPLICATION's date.
    Successive applications of one advance carry DISTINCT journal identities
    (the old `(supplier_payment, paymentId, advance_applied)` identity
    collided with the journal unique constraint, and
    `UNIQUE (payment_id, supplier_invoice_id)` forbade a second application
    to the same invoice outright). The AP equation, aging, supplier
    statement and supplier-advance reconciliation apply each leg from its
    OWN date only.
  - **AR reconciliation is reversal-aware and as-of correct** — the
    append-only `invoice_reversal` record cancels the outstanding exposure
    from the reversal journal's effective date onward; reports dated BEFORE
    the reversal still show the original exposure; no fake payment rows.
  - **Reversal clearing-pair fix** — the restored-deposit/AR clearing legs
    were dropped when the sale journal had no leg on that account (detached
    map-object mutation), producing an unbalanced journal and a 400 on every
    reversal of an invoice settled after the sale. Fixed and pinned.
  - **Concurrent idempotent replay** — two reversals with the same
    clientDocId now both return the original document (the loser previously
    hit the one-reversal conflict before reaching the replay check).
- Deep atomicity: failures injected after the journal and after the
  deepest counter writes prove ZERO partial state across 19 tables
  (canonical row snapshots, not row counts).
- Concurrency: simultaneous GRNs vs one PO (exactly one commits), duplicate
  invoice submission, simultaneous AP allocations (deterministic
  over-allocation conflict), duplicate transfer client-docs.
- Benchmarks (local embedded PG, Node 24.22.2, 30 samples each): GRN
  posting p50 7.5ms / p95 19.6ms; supplier invoice p50 9.8ms / p95
  27.2ms; AP payment p50 6.8ms / p95 16.0ms; trial balance p50 9.3ms /
  p95 10.4ms; sale posting cash p50 14.9ms / p95 34.2ms, credit p50
  13.4ms / p95 34.1ms (benchmarks/*/results/latest.json — the synchronous
  inventory-GL hook adds no measurable cost to the GRN/sale paths, which
  do not use it).
- Financial invariants proven in tests: ΣD=ΣC (TB balanced), Assets =
  Liabilities + Equity, COGS ↔ stock ledger, AR/AP/deposit/advance control
  tie-outs, cash-flow unexplained == 0, period locks block posting.

## Fourth review round — idempotency trust boundary + conservation (head after 3cfa761)

- **Apply-advance idempotency is a COMMAND identity, not just a document
  lookup.** Every application persists the canonical request fingerprint
  (tenant + command type + payment + application business date + sorted
  allocation legs with normalized amounts — domain
  `applyAdvanceRequestFingerprint`, SHA-256 over canonical JSON). A retry
  with the same key and the same normalized payload replays the original
  document; the same key with ANY different material field (amount,
  invoice, payment, date — or a different command type) is a controlled
  HTTP 409 `idempotency_key_reuse`, never a replay of the original
  document for a different request and never a silent second effect.
  Benign retry noise (leg order, "40" vs "40.0000", reworded notes) stays
  a replay. Pre-fingerprint rows keep legacy replay semantics (NULL
  fingerprint, same compat rule as the Phase 3 sync registry).
- **Concurrent same-key retries serialize at the transaction boundary.**
  The command first claims a transaction-scoped advisory lock over
  (tenant, clientDocId) — BEFORE the payment row lock and every
  invoice-domain lock (fixed widening order, deadlock-free) — then
  re-reads and compares the fingerprint under the claim. Two truly
  simultaneous same-key/same-payload requests produce one effect and both
  receive the same logical response; same-key/different-payload produces
  one winner + one 409. The old unlocked pre-check let both callers pass
  the SELECT, the loser then hit the `(tenant_id, client_doc_id)` UNIQUE
  on an aborted transaction (raw 23505, then 25P02 on the catch's
  re-SELECT) and surfaced as HTTP 500 — now structurally impossible, with
  the residual 23505 path translated decisively without further queries.
- **Header ↔ lines conservation invariant (migration 0016, additive).**
  A deferrable-at-COMMIT constraint trigger on both
  `supplier_advance_application` and `supplier_advance_application_line`
  enforces header `amount` = Σ line amounts: forged or incomplete
  application headers (amount ≠ Σ legs, or a header with no legs) abort
  the whole transaction — journal included. Deferral respects the
  header-then-lines construction order; migration 0015's Σ ≤ payment guard
  is unchanged and 0001–0015 remain untouched.

## Known limitations / deferred (deliberate)

- Payment/receipt/deposit reversals and customer returns/credit notes
  remain Phase 5 (invoice reversal is delivered).
- Purchase requisitions are not implemented (the legacy app had none and
  the audit register does not require them; POs support the full
  draft→approval path).
- Landed-cost/freight allocation on purchase lines is not implemented
  (documented as a future posting rule; supplier invoice expense lines
  cover direct charges today).
- Period-close automated checklist execution (unrecon items blocking close)
  is present as the reconciliation screen; a hard gate on close is a
  policy decision left to the accountant (surfaced, not forced).
- Bank statement import is CSV with a documented header; OFX/MT940 parsers
  arrive with the Phase 6/7 integrations.

## Previous Phase 5 action board (historical; now integrated to main)

**As of 2026-11-12:** Phase 5 PR #8 has merged. The below section records implementation history, not current release gates. **Next active steps are in [`docs/PHASE6_ZAI_HANDOFF.md`](PHASE6_ZAI_HANDOFF.md), staging [#10](https://github.com/christianagbotah/idepot/issues/10), and client migration [#9](https://github.com/christianagbotah/idepot/issues/9).**

Per docs/ROADMAP.md Phase 5: return orders/credit notes/store credits/
refunds with approvals + audit; the operational + financial report suite;
KPI snapshots; loyalty (validate demand first); configuration UX; audit
search/export. Migration: returns/refunds/store-credit import and
reporting parity checks.

---


## Completed capabilities (Phase 5 — merged into main; synthetic-fixture tests)

**Returns, credit notes, refunds, store credit, exchanges (Priority A — DONE):**
- `return_reason` policy configuration (approval/refund/replacement/store-credit/restock permissions, inspection + evidence requirements, refund deadlines) — migration 0017.
- Return-order document with tested state machine `draft → submitted → approved → received → processed → completed` (+ rejected/cancelled terminal paths). The original invoice is NEVER edited; every effect is an append-only correction document.
- Quantity protection: `Σ returned ≤ sold` per invoice line — service-level serialization via a per-invoice advisory domain lock + a DEFERRED DB conservation trigger as the second wall. Drafts reserve nothing; cancelled/rejected release their claim.
- Approval workflow: permissioned approval (`returns:approve`), auto-approval policy (reason flag + tenant `refund_approval_threshold`), refund-deadline enforcement, immutable approval/rejection evidence. Cashiers capture but never approve or refund.
- Stock disposition at ORIGINAL cost evidence: sellable/damaged/quarantine restock via the StockPoster (AVCO layers preserved — a return never revalues stock at the day's price); scrap/reject/no-restock leave the cost in COGS transparently.
- Credit notes (migration 0018): separate posted financial document — ONE journal per return with exact scaled-BigInt cumulative proration (credits can never exceed original amounts even across many partial returns), transaction-time tax evidence per component (capped by the `tax_reversal_cap_guard` DB trigger), COGS reversal at cost-at-sale, and the settlement decomposition: AR settled FIRST, the residual becomes refund payable OR store credit (never both — `credit_note_identity` CHECK enforces `total = ar + refund + store_credit`).
- Refund engine: requested → approved → posted → externally settled (settlement is an explicit referenced action — never assumed from an API call); cash refunds settle at posting (drawer payout); failed external settlements post a clean reversal journal and the document stops consuming entitlement (safe retry = new refund document); over-entitlement guarded at service level AND by the `refund_entitlement_guard` DB trigger; idempotent commands (client_doc_id + request fingerprint + advisory claim; same key + different payload ⇒ 409 `idempotency_key_reuse`).
- Store credit: explicit liability instrument distinct from customer deposits; balances DERIVED from the append-only redemption ledger (never mutated); concurrent redemptions serialize on a per-instrument advisory lock; redemption settles invoice dues (Dr store_credit_liability / Cr AR); expiry is an explicit permissioned audited breakage journal (Dr liability / Cr refund_breakage_income) — never silent; void converts liability back to refund-payable entitlement.
- Exchanges: atomic return + replacement sale + settlement in ONE transaction (the return's refund-payable entitlement consumes the replacement invoice's AR; additional payment arrives as sale tenders, a cheaper replacement leaves residual refundable entitlement). UNIQUE per return order.
- Integration guards: invoice reversal REFUSES invoices with returns (no double correction path); the invoice paid derivation counts credit-note AR settlements, store-credit redemptions and exchange consumptions (no AR double-settlement).

**Operational & financial reporting (Priority B — DONE):** coherent framework over canonical dated evidence — daily sales (return-adjusted, returns counted on their OWN business dates so a later refund never rewrites an earlier day), sales by customer/product/user/warehouse, tender totals with refunds netted, the CORRECTED daily-stock formula (ledger-derived closing; legacy defect: closing only computed when sale+transfer both existed), backlog from the order state machine (legacy defect: queried a nonexistent `item_units` table), item margin on the canonical cost-at-sale AVCO basis (legacy defect: three inconsistent tabs), returns by reason, shift variance, stock valuation, customer statement ledger (invoices/payments/returns/credit notes/store credit in one running balance), AR/AP aging with reversal-aware open equations. CSV export for audit.

**KPI (Priority C — DONE):** 13 mathematically-defined metrics; idempotent reproducible snapshots (unique identity per tenant/scope/period/metric/version, explicit source watermark — never authoritative ledgers); effective-dated targets with overlap guards; achievement math with explicit zero-target semantics.

**Administration & audit (Priority D — DONE):** versioned effective-dated tenant settings (new versions never rewrite history; credential-shaped keys rejected); first-class audit search (actor/action/entity/dates/free-text over details, server-side pagination) + CSV export + linked document timeline (invoice → return → credit note → refund/store credit). **User & profile administration (2026-11-09, resolves legacy admin_list.php / modal_admin_add / modal_admin_edit / manage_profile parity rows):** new `users:manage` permission (owner/admin only — pinned in the RBAC matrix for all seven roles); user CRUD API (`GET/POST /admin/users`, `PATCH /admin/users/:id`, `POST /admin/users/:id/reset-password`) + `/admin/users` web page and `/profile` self-service page; Argon2id hashes never returned or logged; every mutation writes audit evidence (user.created/updated with before/after roles, user.password_reset, user.profile_updated, user.password_changed); self-lockout guard (an actor can never change their own roles/status or reset their own password via the admin route) and tenant-lockout guard (the last active owner/admin cannot be disabled or demoted — including the disabled-admin-with-valid-token attack path); the owner role is bootstrap-only and cannot be granted; own password change requires the current password and rejects reuse; disabled users cannot log in and refresh stops working.

**Loyalty foundation (Priority E — DONE, feature-flagged OFF):** program/account/points-ledger tables with a ledger-conservation guard; programs are INACTIVE by default and require the audited `loyalty.enabled` setting before creation or activation; nothing is imported (legacy loyalty DDL never ran); no merchant is auto-enrolled.

**Migration workstream (§19 — DONE):** `transformPhase5Returns` verifies the dead returns DDL, scans sales orders + payment_with_goods for post-payment amendment fingerprints (final amount_paid > final grand_total) and flags them as AMBIGUITY reconciliation records requiring manual review — NO historical return/credit-note/refund/store-credit documents are ever synthesized (`returnsSynthesized: 0` invariant). **2026-11-09 hardening (migration 0020):** the six dead returns tables (`return_reasons`, `sales_returns`, `sales_return_items`, `refund_transactions`, `store_credits`, `returns_audit_trail`) are now STAGED into `legacy_raw` (columns verbatim from the owner's 2026-11-06 schema dump) so the empty-verification reads REAL row counts from the dump instead of passing vacuously when a table is absent; the synthetic fixture carries the empty tables and the migration suite pins the contract with a poisoned-dump case (an unexpected `sales_returns` row → manual-approval record, `imported: 0`, zero rows ever in `return_order`/`credit_note`/`refund`/`store_credit`). Fixture smoke: PASS (28/28 tables staged, 6 dead tables at 0 rows, checksums OK).

**Schema additions:** migrations 0017 (returns foundation + doc types + Phase 5 GL purposes + refund approval threshold), 0018 (credit notes + tax evidence + refunds + store credit + redemptions + exchanges + four deferred entitlement guards), 0019 (KPI snapshots/targets + versioned tenant settings + loyalty foundation + audit indexes), 0020 (legacy_raw staging DDL for the six dead returns tables — non-vacuous no-synthesis verification). GL purposes added: `refunds_payable`, `store_credit_liability`, `refund_breakage_income`. Document sequences added: RTN/CRN/RFD/SCR/EXC.

**Web UI:** returns workbench (approval queue, lifecycle actions, decomposition drilldown, refunds), new-return flow (invoice search → returnable-line evidence → condition/disposition), credit notes (decomposition + inline refund), store credits (derived balances + redemption), 11-tab operational reports, KPI dashboard (snapshots/rebuild/targets), audit search + CSV export, settings versions, users & roles administration (list/create/edit/reset-password with role checkboxes and status filter) and own-profile page (display name + password change).

**Operational-report direct coverage + three defect fixes (2026-11-09 adversarial pass):** the parity register's open-gap #7 ("all 12 report endpoints implemented and web-visible but ZERO direct API test coverage") is resolved by the new 10-test `reports-endpoints.integration.test.ts` — one cash sale + one store-credit return, then exact assertions on every endpoint. The first direct coverage immediately exposed and fixed three real defects:
- `daily-sales` `businessDate` was `String(jsDate).slice(0,10)` = "Mon Nov 09" (not ISO — and colliding across years); now `to_char(...,'YYYY-MM-DD')` in SQL for all five date axes. `returnsTotal` was `money(scaledBigInt)` = raw ×10⁴ scale ("500000" for 50.0000); now `formatMoney`.
- `daily-stock` treated SIGNED outflow movements as positive magnitudes: `salesIssues` rendered −4.000000 and both the opening CASE and the derived closing double-negated (closing 105 instead of 97 for a 100/−4/+1 day). Opening is now the plain signed ledger balance; outflow buckets render positive magnitudes; closing = opening + Σins − Σouts ties to the stock ledger (pinned against stock-valuation).
- `returns-by-reason` failed with HTTP 500 on ANY tenant with processed returns (PostgreSQL `subquery uses ungrouped column "rr.id" from outer query`); rewritten with pre-aggregated per-reason CTEs for refunds and store credits.

**Financial-correctness round (independent review 5834590343, four corrections + endpoint sweep — 2026-11-10):** all four review findings fixed, plus six same-class defects found by the mandated sweep of every operational-report endpoint. Existing behaviour, the 146 unit tests, the 362 prior integration tests and the migration history are preserved; 19 new integration tests pin the corrections.

- **C1 — tax-inclusive & mixed-tax returns (`returns.service.ts`):** the credit-note math lumped inclusive and exclusive tax together, so `total = creditedNet + taxReversalTotal` added the EMBEDDED inclusive tax to the customer entitlement a second time (an inclusive 440.00 sale would credit 480.00), and the journal debits (`netRevenueReversal + taxReversalTotal = creditedNet`) could not balance the credits (`total`) whenever ANY tax existed — the JournalBuilder rejected every return against a taxed invoice. Now: entitlement adds ONLY the exclusive share; contra-revenue strips ONLY the inclusive share; the identity `total = net_revenue_reversal + tax_reversal_total` and the journal balance hold for exclusive-only, inclusive-only AND mixed profiles; the credit-note component evidence mirrors the invoice basis (gross for inclusive, net-of-inclusive for exclusive). Real-PG `returns-tax-matrix.integration.test.ts` (6 tests): full/partial/cumulative returns × exclusive (VAT 10%), inclusive (GETFUND 10%) and mixed (LEVY 5% in + VAT 7.5% on top) with exact half-even figures (e.g. mixed 3×77 → gross 231, levy 11 inside, VAT 16.5 on top, entitlement 247.50 — never 258.50), per-component cumulative caps closing EXACTLY (levy slices 3.6667 + 3.6666 + 3.6667 ≡ 11.0000), AR-first decomposition on an unpaid invoice, and refund posting.
- **C2 — historical daily-sales (`operational-reports.service.ts`):** (a) rows were emitted ONLY for dates carrying invoices — a day with returns/refunds but no new sales vanished from the report; now one row for every date with in-window activity (invoices, credit notes, refunds, sale-day tenders, reversals). (b) `creditSales` was computed from CURRENT settlement state, so a payment or deposit application recorded later rewrote the historical figure; now it is POINT-IN-TIME — only value received on or before that business date settles it (payment business_date, deposit-application date, store-credit redemption date). (c) invoice reversals erased the sale from its original day; now reversals are append-only corrections — the sale STAYS on its own date and the inverse lands on the reversal's effective date, so windows covering both dates net to the truth. `historical-reports.integration.test.ts` (9 daily-sales tests) spans SIX distinct business dates with exact assertions: return-only D3 exists with `returnsTotal 50 / refundsTotal 50 / netRevenue −50`; the D6 receipt and D4 deposit application never shrink D1/D2 credit sales; the D6 reversal nets its own date (`salesCount −1`, `gross −30`) while D2 keeps its sale; the window reconciles exactly (Σ gross 160, Σ net revenue 80, Σ gross profit 32 — tying to the goods truth); inverted ranges are rejected with 400.
- **C3 — daily-stock date ranges:** the aggregation window stopped at `q.from` and IGNORED `q.to` (movements after the from date were never counted — a [Nov1..Nov5] query reported Nov 1 only). Now the FULL closed range [from, to] drives every bucket, opening is the ledger balance before `from`, and closing is the ledger balance as of END of `to`. Four range tests (same file) cover transfers, sales issues, restocking and adjustments across four dates, asserting the RETURNED `row.closing` directly (mid-window 67/27, full-window 71/27 tied to the live balance projection, single-day 65) — never a value re-derived from the row's own components; the reports-endpoints suite's daily-stock assertion now also pins `row.closing === '97.000000'` directly.
- **C4 — migration reconciliation (`transform-phase5.ts`):** `legacyStoreCreditsFound` reported the SUM of rows across ALL six dead returns tables whenever `store_credits` existed — a poisoned dump with sales_returns rows and zero store credits reported the sales_returns count as store credits. Now it reports ONLY the `store_credits` row count. The migration suite's poisoned-dump case (two legacy sales returns, zero store credits) asserts `legacyStoreCreditsFound === 0` alongside the existing no-synthesis proof.
- **Sweep (same-class defects found in the other report endpoints):** (1) `sales-by-*` bound `q.customerId` to the USER and WAREHOUSE dimension filters (matching nothing); (2) the dimension/returns and item-margin sides ignored `warehouseId` while the sales side honoured it; (3) `sales-by-*` and `item-margin` erased reversed invoices from history — both now follow the append-only reversal rule (sale on its date, inverse on the reversal's date) and surface dimensions carrying only returns/reversals; (4) `returns-by-reason` aggregated store-credit issuance with NO date filter (credits issued outside the window were counted); (5) `customer-statement.receivable` and `ar-aging` settled balances with UNDATED allocations (later payments shrank historical statements/agings) and ignored credit-note AR credits — both now use the canonical reversal-aware as-of formula (dated payments, deposit applications, store-credit redemptions, credit-note AR credits, reversal cancellations from the reversal journal's effective date) and the statement ledger gained the append-only `invoice_reversal` arm so `closingBalance` and `receivable` reconcile; (6) the KPI service had the same posted-only sales and undated-AR defects — fixed identically. The accounting AR control check (`reconciliation.service.ts`) also missed Phase-5 credit-note AR credits and would have failed for any tenant using the returns module — it now subtracts them dated by `cn.business_date`, and the new test asserts the full `/api/accounting/reconciliation` report PASSES over a history containing a credit note, a deposit application, a standalone receipt and an invoice reversal (receivable 10.0000, statement/aging as-of D2 both 90.0000).

**Financial-correctness round 2 (independent review 5852472160, four cross-module findings — 2026-11-12):** all four findings fixed on the SAME branch. Existing functionality preserved: the 146 unit tests, all 381 prior integration tests and the migration history are untouched; **16 new integration regression tests** (`review-5852472160.integration.test.ts`) pin the corrections with exact money assertions over real PostgreSQL (two warehouses, historical dates, tax-inclusive and tax-exclusive products, store-credit redemption/expiry/void, and dimension ↔ dated-money-view tie-outs). Parity rules R-P5..R-P8 added to `docs/parity/business-rule-parity.md`.

- **P0-A — AR control excludes store-credit redemptions (`reconciliation.service.ts`):** each redemption posts Dr store_credit_liability / Cr accounts_receivable on its own business_date, but `arControlCheck` never subtracted them — a ₵100 invoice settled by ₵30 of store credit showed GL AR ₵70 and aged AR ₵70 while the subledger said ₵100 and the check failed by exactly ₵30. The canonical reconciliation query now subtracts the dated redemption leg (tenant/id/date protected), matching the aging/statement/KPI formula. The reversal-cancellation branch deliberately stays keyed to what the reversal journal ACTUALLY removes (the inverted sale journal plus its payments/credit-applications clearing pair) so the subledger remains an exact GL mirror for every settlement mix. New tests: issue credit on one invoice → redeem against a DIFFERENT invoice → period-as-of AR aging (200 → 100), customer statement (usable 0 / issued 100 with the redemption ledger line), GL control PASS with `controlBalance == subledgerBalance == 100.0000`, a subsequent payment moving both sides to 70, and a safe idempotent rerun.
- **P0-B — product sales dimension cannot reconcile to dated revenue (`operational-reports.service.ts`):** the product arm of `salesByDimension` filtered `status = 'posted'` (erasing reversed invoices from history) while every other arm followed the append-only rule; net sales used raw `SUM(il.line_net)` (no order-discount proration, no embedded inclusive-tax strip — a ₵110 tax-inclusive item reported ₵110 instead of the canonical ₵100); returns subtracted the pre-tax-strip `credit_net_slice` instead of the dated net-revenue reversal; `itemMargin` originated every row from in-window invoice lines so a reversal-only window had no product row to net into, and used the same raw bases. Fixed: the product arm uses `('posted','reversed')` with the reversal effective on its own date and `COUNT(DISTINCT i.id)` on both sides; per-line revenue is the exact canonical identity `line_net × (subtotal − order_discount − tax_inclusive_total) / subtotal` (sums per invoice exactly to the invoice-level figure, so Σ dimension rows reconcile to daily-sales and the GL for discounted and tax-inclusive invoices alike); returns subtract each line's share of the credit note's `net_revenue_reversal` (axis slice × reversal factor — Σ products of a credit note equals its reversal exactly); `itemMargin` gains the same canonical bases, warehouse scoping on all three legs, reversal-only product rows (synthesized with labels), and the documented sale-period-cohort convention is now EXPLICIT on every row via `returnsAttribution: 'sale-period-cohort'` (a product-performance view that does not claim to sum to the accounting-period P&L — the dated daily-sales/dimension views are the money view that does). New tests: canonical 200 (never 220) for the inclusive product, returns 100 (never 110) for the exclusive one, Σ product netRevenue == Σ daily-sales netRevenue over the same window, reversal-only windows produce product rows (`salesCount −1`, `netRevenue −200`), and the full window sums to zero on both views.
- **P1-C — daily-sales warehouse filter mixed warehouses (`operational-reports.service.ts`):** the sales, reversal and credit-sales legs filtered `q.warehouseId`, but `returnsRows`, `refundRows` and `tenderRows` applied tenant+date ONLY — a W1-filtered day subtracted W2 credit notes/refunds and included W2 POS cash. Fixed: the returns and refunds legs join credit_note/refund → return_order → source invoice and filter by the invoice's ORIGIN warehouse; the tender leg distributes each sale payment across the warehouses its allocations settle, pro-rata by allocation amount (shares sum to exactly 1 per payment, so unfiltered totals are unchanged and warehouse slices tie); unfiltered behaviour is bit-identical to before. New tests: a two-warehouse same-day dataset where the WH1-filtered report shows only WH1 activity on every date (no WH2 return/refund/tender bleed, no phantom rows), and per-date per-field sums of the WH1+WH2 slices tie EXACTLY to the unfiltered rows (gross/net/tax/cogs/cash/credit/returns/refunds/netRevenue).
- **P1-D — customer store-credit balance not point-in-time (`operational-reports.service.ts` + contracts):** `customerStatement` computed the store-credit column from ALL-TIME `sc.amount − ALL-TIME redemptions` filtered by `status IN ('active','expired')` — a later redemption retroactively rewrote an older as-of statement, an EXPIRED credit still showed its unredeemed remainder as redeemable money (the liability had already been posted to breakage income), and a credit whose status moved to redeemed/void vanished entirely from the issued history. Fixed: the column is AS OF the statement date — issued from `sc.business_date` (ALL statuses), redemptions dated `business_date ≤ asOf`, expiry evidence from `sc.expiry_date` (the business date the breakage journal carries) removing the then-unredeemed remainder, and void evidence from the void journal's own business date; `storeCreditIssued` (new DTO field) keeps the GROSS issued figure so the statement distinguishes value received from value still usable. New tests: D1 issue ×3 (50 each), D2 redemption, D3 expiry, D4 void — as-of statements read 150 → 100 → 50 → 0 usable while issued stays 150 at every date, and the older as-of views never move.

**Verification:** 146 unit tests, 397 integration tests (28 files — the prior 381 plus the 16-test review-5852472160 suite: P0-A redemption reconciliation (aging/statement/GL control/safe rerun), P0-B canonical product revenue + dated reversals + reversal-only product rows + dimension ↔ daily-sales tie-outs + the explicit sale-period-cohort label, P1-C two-warehouse same-day isolation with exact slice ties, P1-D point-in-time store credit across issue/redeem/expire/void; — migration-smoke 12 cases incl. dead-table staging + poisoned-dump no-synthesis proof with the corrected `legacyStoreCreditsFound`; the 11-test returns suite: full/partial/multiple returns, AR-first decomposition, damaged/scrap at original cost, store-credit lifecycle, exchanges, over-return/over-refund refusals, idempotent replay vs key-reuse, RBAC, cross-tenant isolation, deep atomicity with safe retry, goodwill no-stock adjustment; the NEW 6-test returns tax matrix (exclusive/inclusive/mixed × full/partial/cumulative with exact journal, entitlement, evidence and cap assertions); the NEW 13-test historical-reports suite (six-date daily-sales history stability, point-in-time credit sales, append-only reversals, as-of statement/aging/AR-control reconciliation, four daily-stock range windows asserting the returned closing); the 25-test returns domain suite pinning cumulative-proration exactness with a 500-trial seeded property sweep (Σ slices ≡ total — the credit cap), half-even rounding ties, decomposition edge cases and command-fingerprint normalization; the 15-test users-admin suite: RBAC for all roles, create/login/duplicate-409/per-tenant email uniqueness, audited role changes, self-lockout + last-active-admin guards incl. the disabled-token path, password reset + disabled-login refusal, own profile/password change, cross-tenant isolation; rbac-matrix extended to 94 cases with the users:manage gate for every role), migrations from zero + idempotent rerun + RLS fail-closed, fixture migration smoke PASS (parsed-dump fallback AND the CI MySQL staging backend — 28/28 tables staged, 0 checksum mismatches, `legacyStoreCreditsFound: 0`), schema parity 66/66 tables 0 drift, lint 0 errors, clean typecheck, topological build.

## Phase 6 — in progress (branch `phase-6/desktop-mobile-hardware`)

**Track A — staging deployment readiness (issue #10, prepared — NOT deployed):**
- `docs/staging/staging-runbook.md`: HARD capacity gate from the 2026-11-12 VPS inspection (90% disk, exhausted swap), read-only disk analysis commands (obsolete release dirs, caches, rotated logs — owner-approved cleanup only), headroom rules, scripted deploy flow.
- `scripts/deploy/`: `package-release.sh` (OFF-VPS pinned-SHA packaging with full verification + checksums + provenance), `staging-preflight.sh` (read-only gates, verified against a live sandbox), `staging-deploy.sh` (releases/<sha>/ + health-gated atomic `current` flip, separate PG role/DB, chmod-600 secrets, PM2, dry-run default), `staging-smoke.sh` (V1/V1b/V7/V8), `staging-rollback.sh`, `staging-backup.sh` + `staging-restore-check.sh`. Shellcheck clean.
- `seed-staging.ts`: synthetic demo tenant (6 role users, random chmod-600 credentials) + reference data through the REAL API; idempotent; validated end-to-end on embedded PostgreSQL (fresh / re-run / partial-state failure modes).
- `uat-smoke.ts`: 16-check API-driven UAT harness with EXACT money math (tax computed from the tenant's effective default profile) — **validated 16/16** against a locally deployed release (health SHA, exact sale/change, allocation, return entitlement, warehouse-scoped reports, TB balance, all 5 control checks).
- `infra/pm2/idepot-staging.ecosystem.config.cjs` (loopback-only, memory caps, log rotation), `docs/staging/webuzo-vhost.conf.example` (apply THROUGH Webuzo, never by editing managed config), `docs/staging/UAT-EVIDENCE.md` template.
- **NOT claimed:** any live staging URL — DNS/TLS/deployment require the owner's authorized channel.

**Track B — Phase 6 engineering:**
- `packages/hardware` (B4): ESC/POS builder (58/80mm, CP437 pinned, cedi documented), CODE128/EAN-13/QR, drawer-kick primitive; adapter framework with simulated transports for every class; guarded drawer (open-shift, no duplicate sale kicks); terminal registry. 17 tests incl. golden byte streams.
- `packages/print-templates` (B5): receipt/credit-note thermal + A4 invoice/quotation/statement/waybill templates rendering API evidence only; 2dp+separators display with half-even cents. 10 tests. Web quotation print page `/print/quotation/[id]` (parity gap closed).
- `packages/offline` (B3): storage-agnostic engine — transactional outbox capture, idempotent dependency-ordered push with backoff, explicit conflict queue, resumable cursor-checkpointed pull. 11 tests.
- Device administration (migration 0021 additive): pairing codes (single-use, 15-min), hardware profiles, revocation that immediately blocks sync (guard in `sync.service`), license seats; `devices:read`/`devices:manage` RBAC. 5 integration tests incl. cross-tenant isolation.
- `apps/desktop` (B1, source-ready): Tauri 2 config (MSI/NSIS/DMG + updater), SQLite offline adapter. **No installer claimed** — needs matching host runners + signing.
- `apps/mobile` (B2, source-ready): React Native login/pairing/sync-status/conflict-review + expo-sqlite adapter. **No APK/IPA claimed.**
- `benchmarks/offline-chaos` (B6): 50-terminal chaos on real PG — **PASS** (seed 42): 196/196 invoices applied, stock ledger −196 ties, cash exactly 1960.0000, 49 duplicates suppressed, revoked terminal's 4 events refused + queued, p95 937ms / p99 1018ms.
- **Accounting fix found by the UAT harness:** `cogs_vs_stock_ledger` never subtracted customer-return restocks on the ledger side (failed by exactly the restocked cost for any tenant with a restocking return); now dated-symmetric with the credit-note COGS reversal. 3 regression tests (same-day, backdated as-of, scrap).
- **Open parity gaps (tracked, not silently dropped):** global search, price-list management UX, quotations list UI (print exists), SMS/loyalty remain demand-gated.

**Verification (branch `phase-6/desktop-mobile-hardware`):** lint 0 errors; clean typecheck; topological build; **184 unit** (146 baseline + 38 new) and **405 integration** (397 baseline + 8 new) on real PostgreSQL; migrations 0001–0021 from zero + idempotent rerun; fixture smoke PASS; chaos PASS. Baselines preserved — no test weakened or skipped.
