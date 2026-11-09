# UAT Checklist — iDepot Legacy Parity Acceptance

Purpose: owner-verified walkthrough of every **active depot capability**
before staging sign-off. Each scenario cites its legacy origin (view/rule),
the new route, and the evidence to capture. Derived from
[legacy-view-matrix.csv](legacy-view-matrix.csv) (266 rows: 219 active,
7 active-broken, 39 dead, 1 school-only) and
[business-rule-parity.md](business-rule-parity.md).

Conventions: run on staging with the **synthetic demo tenant** (never client
data). Tick ☐→☑ with a screenshot or export per scenario. RBAC columns:
**C**=cashier, **M**=manager, **A**=accountant, **Ad**=admin.

## 1. Access & shell

| # | Scenario (legacy origin) | Steps | Pass evidence | Role |
|---|---|---|---|---|
| 1.1 | Login (`login.php`) | Log in with wrong password → clear error; correct login → app shell | Screenshot both | all |
| 1.2 | Navigation (`*-nav.php`) | Every primary menu route opens without console errors: /catalog /customers /suppliers /units /categories /warehouses /inventory/* /pos /sales /sales-orders /payments /deposits /shifts /returns/* /purchasing/* /ap /banking/* /accounting/* /reports /kpi /admin/* /profile | Route list with ✓ | Ad |
| 1.3 | Logout (`modal_logout.php`) | Logout → login page; back button does not re-enter | Screenshot | C |
| 1.4 | Landing (`dashboard.php`) | Confirm the intentional change: login lands on /catalog; KPI dashboard at /kpi | Owner sign-off on the change | Ad |

## 2. POS & sales (the daily bread)

| # | Scenario | Steps | Pass evidence | Role |
|---|---|---|---|---|
| 2.1 | Cash sale (`pos_page.php`, `add_invoice.php`) | Scan/search item → Enter; edit qty; tender cash ≥ total; change shown; commit | Receipt shows total, tendered, change; invoice PAID | C |
| 2.2 | Split tender (`cash_goods.php`) | Part cash + part MoMo (provider/phone/ref) | Receipt lists both tenders; Σ=amount paid | C |
| 2.3 | Unit sale (`add_order_row_pos_unit*.php`) | Sell in a non-base unit (conversion) | Line shows unit, qty, converted base qty, price | C |
| 2.4 | Credit sale (`add_sales_order.php`) | Customer on credit; confirm order → invoice posted | Invoice part_paid; AR appears | M |
| 2.5 | Receipt print (`receipt*.php`) | Print thermal-80mm and A4 from ONE payload | Both renders correct; balance owed = this invoice due | C |
| 2.6 | Offline sale (`pos_page.php` offline) | Disconnect network → sell → reconnect → outbox drains | Sale appears exactly once; status indicator transitions | C |
| 2.7 | Offline duplicate replay | Same offline sale delivered twice | Second delivery replays ORIGINAL result (same id); no duplicate | (automated: sales-sync-chaos) |
| 2.8 | Quotation (`create_proforma_invoice.php`) | **API-only today**: issue → accept → convert via API until web page lands | Quotation code + lifecycle evidence | M |
| 2.9 | Price authority (`pricing.php`) | Resolve a price-list price at POS; attempt override without approval | Correct price; override blocked/flagged | C/M |
| 2.10 | Invoice reversal | Reverse a posted invoice (no returns against it) | Reversal journal balanced; original immutable | M |

## 3. Payments, deposits & credit

| # | Scenario | Steps | Pass evidence | Role |
|---|---|---|---|---|
| 3.1 | Standalone receipt (`payments.php`) | Receive against 2 invoices with explicit allocations | Allocations recorded; ladder advances | C |
| 3.2 | Deposit (`add_sales_order_negative_bal.php`) | Take deposit (no invoice) | Deposit document; liability visible | C |
| 3.3 | Apply credit (`payment_with_goods.php`) | Apply deposit to oldest invoice (waterfall) | Credit application row; due drops | M |
| 3.4 | Customer statement (`customer_statement.php`) | /reports customer-statement | Running balance: invoices, payments, returns, credit notes, store credit in ONE ledger | A |

## 4. Returns, refunds & store credit (Phase 5 — legacy was broken)

| # | Scenario | Steps | Pass evidence | Role |
|---|---|---|---|---|
| 4.1 | Partial return (`refund_sales_order.php` origin) | New return: 1 of 2 lines, reason "damaged", disposition quarantine | Return doc; Σreturned ≤ sold enforced | C captures, M approves |
| 4.2 | Decomposition | Credit note AR-first | total = AR settled + refund + store credit (never both residual paths) | A |
| 4.3 | Cash refund + approval | Refund below/above tenant threshold | Below: auto-approve path; above: requires `returns:approve`; cashier cannot approve | M/A |
| 4.4 | Store credit (`store_credits` dead DDL → real) | Residual → store credit; redeem against a later invoice; expire with breakage journal | Balance derived from redemption ledger; expiry journal explicit | A |
| 4.5 | Exchange | Return + replacement sale in ONE transaction | Cheaper → residual entitlement; pricier → extra tender | M |
| 4.6 | Stock disposition at original cost | Sellable restock / damaged quarantine / scrap | AVCO layers preserved; scrap leaves cost in COGS transparently | A |
| 4.7 | Over-return refusal | Attempt to return more than sold | Refused with clear error (also DB-guarded) | C |

## 5. Inventory

| # | Scenario | Steps | Pass evidence | Role |
|---|---|---|---|---|
| 5.1 | Transfers (`items_transfers/*`) | Create → dispatch → receive (partial) | In-transit account; value carry; exact-residual convention | M |
| 5.2 | Counts & adjustments | Count sheet → variance → approve | Variance journal; ledger rebuild matches | M/A |
| 5.3 | Item history (`item_history.php`) | /inventory/movements for a product | Full movement ledger with cost evidence | A |
| 5.4 | Stock valuation (`inventory_report.php`) | /reports stock-valuation | Σ = AVCO on-hand value; ties to GL inventory control | A |

## 6. Purchasing & AP

| # | Scenario | Steps | Pass evidence | Role |
|---|---|---|---|---|
| 6.1 | PO lifecycle (`add_purchase_order.php`) | Draft → submit → approve → issue | PO states; commitment only (no stock/AP hit) | M |
| 6.2 | GRN (`preview_order.php` receiving) | Receive partial with over-receipt tolerance + approval | AVCO layers at receipt cost; Dr Inv / Cr GR-IR | M |
| 6.3 | Supplier invoice 3-way match | Invoice with price variance beyond tolerance | Exception approval required; never silent rewrite | A |
| 6.4 | Supplier payment + advance (`payments.php`) | Pay with allocation; overpay → advance; apply advance later | Advance asset; application journal; idempotent replay | A |
| 6.5 | AP aging + statement (`accounts_payable.php`, `get_payables_taken_list*.php`) | /ap aging buckets; statement asOf | Every document exactly once; as-of sees no future | A |
| 6.6 | Debit/credit notes | Stock return at AVCO cost | Same-transaction journal; append-only | A |

## 7. Banking & GL

| # | Scenario | Steps | Pass evidence | Role |
|---|---|---|---|---|
| 7.1 | Transfer with fee (`account_transfer.php`) | Bank A → B with fee | Balanced journal; fee explicit | A |
| 7.2 | Statement import & match (`banking.php`) | Import CSV; match suggestion; manual match/unmatch | Suggestions never auto-post; differences explicit | A |
| 7.3 | Journals (`view_journals.php`, `journal/*`) | GL inquiry filters; manual journal + preview; reverse | ΣD=ΣC; reversal-as-new-entry | A |
| 7.4 | Periods | Soft-close month; post correction; attempt closed | Soft-closed accepts corrections (audited); closed refuses | A |

## 8. Reports & KPI

| # | Scenario | Steps | Pass evidence | Role |
|---|---|---|---|---|
| 8.1 | Daily sales, return-adjusted | Sell day 1; return day 2; report day 1 | Day 1 unchanged by the day-2 return (returns on their OWN dates) | A |
| 8.2 | Daily stock (`daily_stock_report.php`) | Movement mix: sale-only day, transfer-only day | Closing derived on BOTH (legacy only computed when sale+transfer existed) | A |
| 8.3 | Backlog (`backlog.php`) | Open orders | Backlog from state machine (legacy queried a nonexistent table) | M |
| 8.4 | Item margin (`stock_margin_report_*.php`) | One canonical margin tab | Cost-at-sale AVCO basis; no 3-tab inconsistency | A |
| 8.5 | Tender totals with refunds netted | Refund a cash sale | Refund reduces the tender total | A |
| 8.6 | Financial statements (`*_report.php`) | TB / P&L / BS / CF for a period | TB balanced; COGS ties to AVCO; A=L+E; CF unexplained = 0 | A |
| 8.7 | KPI dashboard (`dashboard.php` analytics) | Snapshot rebuild; targets | Reproducible snapshots; achievement math incl. zero-target semantics | Ad |
| 8.8 | CSV export | Export audit + report CSVs | Files download with data | A |

## 9. Administration & security

| # | Scenario | Steps | Pass evidence | Role |
|---|---|---|---|---|
| 9.1 | Settings versions (`system_settings.php`) | Change a setting | New version; history preserved; credential-shaped key rejected | Ad |
| 9.2 | Audit search (`view_journals.php` lineage) | Search actor/entity/date; open invoice timeline | Linked timeline invoice → return → credit note → refund | Ad |
| 9.3 | RBAC matrix | Cashier tries approve-return, journal, settings | 403s with codes (automated: rbac-matrix) | C/M/A |
| 9.4 | Cross-tenant isolation | Tenant A token hits tenant B data | Impossible (RLS fail-closed) (automated) | — |
| 9.5 | User management | **PENDING** — see gap register | Blocker documented in issue #9 | Ad |
| 9.6 | Own profile / password change | /profile: display name + password change | Change works with current password; reuse rejected; audited | all |

## 10. Exit criteria

- [ ] All scenarios above ☑ or explicitly waived by the owner with reason.
- [ ] Open gaps 1–8 (business-rule-parity.md §7) either fixed or scheduled
      with owner sign-off (tracked in issue #9).
- [x] Operational-report endpoint tests merged (gap 7 RESOLVED 2026-11-09: reports-endpoints.integration.test.ts, 10 tests, 3 defects found+fixed).
- [ ] No placeholder/`TODO` text in any delivered screen.
- [ ] Staging smoke (issue #10) green: HTTPS login + one full
      POS→invoice→payment + GRN→AP→settle + return cycle on synthetic data.
