# Business-Rule Parity — Legacy CodeIgniter vs iDepot Next.js/NestJS

Basis: the 2026-11-06 owner intake (`legacy/intake/2026-11-06/`) cross-checked
against the sanitized source (`legacy/source/`), the Phase 0 forensic register
(`docs/legacy-audit/business-rules.md`, `calculation-register.md`,
`defects-and-risks.md`, `returns-refund-credit.md`, `document-numbering.md`,
`unit-conversion-rules.md`, `stock-movement-map.md`) and the **verified**
current implementation surface (apps/web routes, apps/api controllers, test
files — re-enumerated 2026-11-09).

Rule: parity means **functional equivalence plus defect correction**. Known
legacy defects are preserved-and-fixed (each fix cites its defect), never
silently ported. Dead, duplicate, broken and school-only screens are not
ported (see [legacy-view-matrix.csv](legacy-view-matrix.csv) for the per-view
verdicts).

## 1. Money and math

| # | Legacy rule (defect) | New rule | Where enforced | Test |
|---|---|---|---|---|
| M-1 | `double` money everywhere; client-side row totals duplicated per row (R14) | Exact scaled-BigInt decimal, 4dp, half-even, computed once server-side per line; header total = Σline.net − order_discount (DB CHECK `total = subtotal − discount`) | `packages/domain/sales.ts`, `invoice` CHECK | sales-flows.e2e, domain unit tests |
| M-2 | Payment ladder compared POST strings with `===` (R4) | Numeric derivation `unpaid → part_paid → paid → over_paid` from decimal comparison | payment derivation | sales-flows.e2e |
| M-3 | `Σ tenders == amount_paid` unenforced; change could go negative | Σ tenders == amount_paid, change never negative, overpay only in cash; structured Ghana tenders (MoMo provider/phone/txn, cheque bank/branch/number) | domain + DB | sales-flows.e2e |
| M-4 | Discount never stored (R8) — printouts disagreed with math | Order discount explicit on the header; per-line tax basis pro-rated; server recomputes on import | domain | sales-flows.e2e, migration-smoke |
| M-5 | Receipt `amount_due` print mismatch (R9) | ONE receipt payload; balance owed = THIS invoice's due | `/sales/invoices/:id/receipt` | sales-flows.e2e |
| M-6 | Multi-account receipts double-counted `amount_paid` (D1) | Payments are typed tenders + explicit allocation rows; amount_due ≡ total − Σallocations − Σcredits (guard trigger) | `payment_allocation_guard` | migration-smoke (D1 fixture), sales-flows.e2e |

## 2. Sales, POS and credit

| # | Legacy rule (defect) | New rule | Test |
|---|---|---|---|
| S-1 | POS offline = no sale | Offline-first web POS: IndexedDB outbox with same identity; drained via `/sync/push` through the SAME posting coordinator; duplicates replay the original result; key+payload mismatch → 409 `idempotency_key_reuse` | sales-sync-chaos (14 tests incl. true Promise.all races) |
| S-2 | Order edit mutated financial history | Append-only documents; orders editable only before confirmation; invoice reversal is a new document in ONE transaction | review-hardening |
| S-3 | Deposits were negative invoice rows | `customer_deposit` liability documents + explicit `credit_application` rows (oldest-first waterfall, advisory-locked) | sales-flows.e2e |
| S-4 | Payment-with-goods mirror table (`payment_with_goods`) drifted from `sales_order` | Single canonical order; credit applications are first-class rows; PWG table not migrated (mirror verified per so_code at import) | migration-smoke (D4 row-set diff) |
| S-5 | Quotation (proforma) had no lifecycle | draft → issued → accepted → converted (+ rejected/expired/cancel), evidence columns, validity-window guards, conversion requires acceptance | review-hardening |
| S-6 | Destructive in-place "refund" broke against its own schema (`Admin::sales_order_refund` updated non-existent columns; hardcoded SO code) | Full returns engine: return orders with state machine, Σreturned ≤ sold per line (advisory lock + DEFERRED trigger), credit notes with cumulative proration caps, AR-first settlement decomposition (refund payable OR store credit, never both), refund approval workflow, exchanges atomic | returns-flows (11 tests) |
| S-7 | Shift cash was whatever the cashier typed | Expected cash DERIVED from posted documents (float + cash tenders − change + paid-in − paid-out); variance = counted − expected; supervisor review gate (cashier 403) | sales-flows.e2e |
| S-8 | Document codes raced (same-millisecond collisions) | Row-locked `UPDATE … RETURNING` sequences; booklet-first allocation for INVOICE/WAYBILL; first-class spoilage; offline leases validated at sync | sales-flows.e2e (3-cashier concurrency) |

## 3. Stock and costing

| # | Legacy rule (defect) | New rule | Test |
|---|---|---|---|
| I-1 | `stock_manager` cross-user contamination; closing only computed when sale+transfer both existed | Append-only stock ledger; balances rebuildable; daily-stock closing derived from the ledger regardless of movement mix | stock-operations.e2e, inventory-invariants |
| I-2 | No cost evidence; margin computed three inconsistent ways | AVCO (ADR-0004): cost-bearing receipt layers, proportional issue cost, `stock_cost_state` in the locked critical section, cost-at-sale stored on the line; item-margin on the canonical basis | financial-hardening, benchmarks |
| I-3 | Unit conversions trusted the client | Server-authoritative conversion authority; unit sale lines carry conversion evidence | inventory-invariants, sales-flows.e2e |
| I-4 | Oversell crashed or went negative silently | Per-tenant policy `reject` (409) / `allow_backorder` (ledger applies + exception task inside the posting tx) | sales-sync-chaos |

## 4. Purchasing, AP and banking

| # | Legacy rule (defect) | New rule | Test |
|---|---|---|---|
| P-1 | PO save hit stock+AP immediately (collapsed PO+GRN+invoice) | PO = pure commitment; GRN = stock authority (AVCO at receipt cost, Dr Inventory/Cr GR-IR); supplier invoice = AP authority with 3-way match, tolerances, exception approval; invoice-before-receipt structurally prevented | purchasing-flows.e2e |
| P-2 | PPV silently re-valued stock | PPV posts explicitly; inventory never re-valued at invoice time | purchasing-review-regressions |
| P-3 | AP balances were mutable snapshot rows | Append-only payments with allocations serialized by per-invoice advisory locks; advances + later application; debit/credit notes; aging + statements regenerate from documents | purchasing-concurrency, accounting-statements |
| P-4 | Bank transfers unbalanced / fee-less | Transfers with explicit fees, balanced journals, duplicate client-doc protection | banking-flows |
| P-5 | Statement import trusted | Uploads untrusted (5MB/20k-line bounds, strict validation, parameterized SQL), file-sha256 + per-line identity dedupe; deterministic match suggestions NEVER auto-post | banking-flows |

## 5. Accounting and reporting

| # | Legacy rule (defect) | New rule | Test |
|---|---|---|---|
| A-1 | `general_journal` flat rows with account NAME strings; balances as snapshots | Append-only `journal_entry`/`journal_line`, ΣD=ΣC enforced twice (builder + DB trigger), business date + document reference, purpose-resolved accounts (never hard-coded ids) | accounting-statements, posting-coordinator |
| A-2 | No tax engine (vat columns always 0) | Effective-dated versioned tax profiles with named components; transaction-time evidence rows per component; no statutory rates embedded | financial-hardening (17-test suite) |
| A-3 | Trial balance/BS computed in views with plugs | TB (opening+period+closing) ties to the BS by construction; A = L + E with real equity + current earnings; indirect cash flow with corrected signs and exact ledger reconciliation (unexplained surfaced, never plugged) | accounting-statements, financial-corrections (12-scenario E2E) |
| A-4 | Reports read frozen `debtors`/`creditors` snapshots | AR/AP/control reconciliation regenerates from documents; differences explicit | financial-corrections |
| A-5 | Reports could see future-dated transactions | As-of reporting never sees future transactions (period-aware queries) | financial-corrections (Blocker 4) |

## 6. Security and administration

| # | Legacy rule (defect) | New rule | Test |
|---|---|---|---|
| SEC-1 | Two-phase login leaking superadmin email; 5-char auth keys | Argon2id + HS256 pair with rotation, device registry, forced password reset on import | rbac-matrix |
| SEC-2 | Permission checks scattered/absent; debug backdoor report (`/test`) | RBAC catalog + server-authoritative guards on every route; cross-tenant impossible (RLS fail-closed, transaction-scoped `SET LOCAL app.tenant_id`) | rbac-matrix (37+ cases), inventory-trust-boundary |
| SEC-3 | Secrets in `settings` (SMS creds) | Secrets outside Git; versioned tenant settings REJECT credential-shaped keys; audit search + CSV export | returns-flows (settings guard) |
| SEC-4 | No audit trail (`audit_log` never written) | First-class audit events + outbox on every posting; audit search with linked document timeline (invoice → return → credit note → refund/store credit) | returns-flows, posting-atomicity-deep |

## 7. Verified open gaps (register in issue #9)

Functional gaps verified against the current code on 2026-11-09 — each maps
to matrix rows with `pending`/`partial`:

1. ~~**User/staff management** (`admin_list.php`, `modal_admin_add/edit.php`)~~
   **RESOLVED 2026-11-09 (Phase 5 branch):** `users:manage` permission
   (owner/admin only), `GET/POST /admin/users`, `PATCH /admin/users/:id`,
   `POST /admin/users/:id/reset-password` + `/admin/users` page; Argon2id;
   audited before/after role evidence; self-lockout + last-active-admin
   guards; 15-test integration suite + RBAC-matrix rows for all 7 roles.
2. ~~**Own-profile management** (`manage_profile.php`)~~
   **RESOLVED 2026-11-09 (Phase 5 branch):** `/profile` page with
   `POST /auth/profile` (display name) and `POST /auth/change-password`
   (current password required, reuse rejected, audited).
3. **Global search** (`search_result.php`): per-page search only; no
   cross-entity search endpoint.
4. **SMS settings/integration** (`sms_settings.php`): settings versioning
   exists but intentionally rejects credential-shaped keys; no send
   integration (demand unvalidated — loyalty-style flag-off default).
5. **Quotation web UI + A4 print** (`create_proforma_invoice.php`,
   `proforma_invoice_print.php`): API + lifecycle + tests complete; web page
   and print layout pending.
6. **Price-list management web UI** (`pricing.php` family): price-lists API
   (create/close/resolve, effective-dated) implemented; management page
   pending.
7. ~~**Operational reports integration tests**~~
   **RESOLVED 2026-11-09 (Phase 5 branch):** the new 10-test
   `reports-endpoints.integration.test.ts` covers every operational report
   endpoint with exact money/quantity assertions — and the first direct
   coverage immediately exposed and fixed THREE real defects:
   `daily-sales` emitted JS-Date garbage as `businessDate` ("Mon Nov 09" —
   wrong ISO contract, colliding across years) and returned `returnsTotal`
   scaled ×10⁴; `daily-stock` double-negated SIGNED outflow quantities
   (salesIssues showed −4 and the derived closing was wrong whenever sales
   existed); `returns-by-reason` 500'd on ANY tenant with processed returns
   (PostgreSQL: subquery uses ungrouped column "rr.id" from outer query).
   Financial statements remain covered by accounting-statements /
   financial-corrections.
8. **Legacy landing dashboard** (`dashboard.php`): login lands on `/catalog`;
   KPI dashboard at `/kpi` covers analytics. A legacy-style home screen does
   not exist (intentional change — confirm with owner in UAT).

Deliberate exclusions (documented, not gaps): dead/duplicate/broken PHP
screens (43 rows), the school-era calendar remnant (1 row), root duplicates
(4 rows), `pos-old/` backups, ESC/POS hardware adapters and offline quota
leases (Phase 6 options), and the multi-shop/shelves DDL (dead in legacy;
multi-branch is target-only scope).
