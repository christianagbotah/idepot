# Calculation Register — Every Formula, Its Intent, Its Defects, and the Corrected Rule

Format: **C-n. Name** — legacy formula (quoted, with file:line) → intent → observed defects → **corrected rule** for the rebuild. "Verdict" reflects whether the *mathematical intent* is sound to preserve.

---

## Sales line & order math

**C-1. Line amount** — `total_pos_price = quantity × unit_price` (JS, `add_order_row_pos.php:173-181`; unit variant 188-196; server stores posted value, `Admin.php:5929`).
Intent: line extension. Verdict: sound. Defects: computed only in the browser; no server recompute; float.
**Corrected:** server computes `line.net = unit_price × qty` (decimal) from canonical prices; client value is advisory only.

**C-2. Grand total** — JS sums line amounts then `total = Σ lines − discount` (order-level discount once, `add_order_row_pos.php:204-294`); the server then stores this single value **on every row**: `grand_total = hidden_total_pos` inside the per-item loop (`Admin.php:5930`; negative-bal adds `balance_due`, 10559; picking 12352).
Intent: order total after order-level discount. Verdict: intent sound. Defects: R14 denormalization (Σ rows multiplies by line count); credit-sale JS variant subtracts the customer's creditor balance pre-post and the server re-adds it — fragile round-trip; discount not applied to line amounts so `Σ sales_order.amount ≠ grand_total` (R9 — invoice print shows the wrong total).
**Corrected:** `invoice_total = Σ line.net − order_discount (+ tax)` computed server-side once on the header; lines carry only their own net; discount allocation to lines optional but documented; invariant `invoice_total = net + tax − discount` property-tested.

**C-3. Ton/bundle quantity derivation** — `total_quantity_main = item_unit_quantity × quantity` (pieces from tonnage) but `amount = quantity × unit_price` on the bundle (`add_order_row_pos_unit_fixed_quantity.php:222-231`).
Intent: sell by ton, track pieces. Verdict: sound. **Corrected:** store both transacted (bundle qty) and base-unit qty via conversion factor; amount on transacted unit price.

**C-4. Price resolution order** — `order_item_selected` (`Admin.php:23866-24049`): purchase rows → `items.purchase_price`; unit sale → `items_units_prices` (customer+item, **no unit filter**, dates commented) else `units_items.unit_price`; package sale → `items_prices` `last_row()` (**no ORDER BY**) else `items.selling_price`.
Intent: customer-specific pricing with fallback. Verdict: intent sound. Defects: R13 nondeterministic picks; missing unit filter; date filters disabled.
**Corrected:** effective-dated price resolution (customer segment → customer → default), deterministic (latest effective row), unit-aware; property test: resolution never returns NULL for a sellable item.

**C-5. Price back-fill on first sale** — the transacted price is inserted into `items_prices` for the customer (`Admin.php:6214-6239`).
Defects: `customer_id` never set in `$priceData` (NOT NULL violation/0), insert gated on the **last** loop iteration's existence check (R15).
**Corrected:** explicit "capture current price as customer price" action or automatic with correct keys; auditable price history.

**C-6. Payment split & due** — `amount_left = total − paid` (JS `payment_update()`, `add_order_row_pos.php:296-324`); `change_due = tendered − paid` (327-334; server 6404, 16762); `update_amount_paid()` sums per-account inputs (`get_main_page.php:1530-1550`).
Intent: multi-tender + change. Verdict: sound. **Corrected:** server-side validation `Σ tenders = amount_paid`; change never negative (validation exists, 16801-16803 — keep); tenders stored individually.

**C-7. Status ladder** — see [sales-pos-lifecycle.md](sales-pos-lifecycle.md) §4.
Defects: strict `===` on POST strings ("500" ≠ "500.00"); no overpaid branch at create (R4).
**Corrected:** numeric compare with epsilon; explicit branches unpaid/partial/paid/overpaid; derived column, recomputed on every allocation event, never stored from the client.

**C-8. Cash-sales-in-payables apportionment** — when `Σ quantity_due > 0`: `cash_sales_amount = Σ price × quantity_picked`, then per payment account the running remainder is stored in `cash_sales_in_payables` (waterfall, `Admin.php:6345-6392`).
Intent: split today's cash between delivered value vs prepayment. Verdict: intent sound (Ghana depot practice: cash collected vs goods actually handed over).
**Corrected:** derive at report time from fulfillment vs payment dates rather than a stored per-row waterfall; keep the "delivered vs prepaid" split as a first-class report dimension.

## Stock math

**C-9. Stock mutation** — `items.quantity ± n` raw SQL at every event (catalogue in [stock-movement-map.md](stock-movement-map.md) §2); unit sale: break-a-box per C-10.
Defects: no transactions; check-then-act races; float; snapshots drift (only `delete_sales_order` cascades).
**Corrected:** append-only ledger movements; on-hand derived & cached; `SELECT … FOR UPDATE` or optimistic version on the product-location row; decimal(18,6).

**C-10. Unit breakout** — see [unit-conversion-rules.md](unit-conversion-rules.md) §2. Defects: U1 float drift; U2 0/1-only package balance; per-second row races.
**Corrected:** single base-unit pool; conversion conserves quantity (invariant test `Σ movements in base units ≡ Δ on-hand`).

**C-11. Daily stock report** — `Available = opening + stock_in_today`; `Out = cash + credit + deposit + transfers` (Σ quantity_picked per type); `Expected closing = Available − Out`; `Actual = last item_balance snapshot` (`get_daily_stock_report.php:159-188`).
Intent: cashier daily variance sheet. Verdict: intent sound. Defects: actual only computed when sale AND transfer exist (59-70); cross-user contamination of `stock_in_today`; hardcoded "CEMENTS OUT".
**Corrected:** shift-scoped session: opening count (physical or system), movements from ledger filtered by shift/terminal, expected vs counted variance with approval.

**C-12. Stock margin** — daily: `S = Σ qty×price`, `C = Σ qty×cost_price`, `M = S−C`, `M% = M/S×100` over `payment_with_goods` excluding `type_of_sales='Receivables'` (`get_stock_margin_report_daily.php:38-40,179-193`); weekly: same formulas but source **`sales_order`** with ISO-week range + averages + settled-discount netting (weekly view 41-74, 160-257); monthly: `payment_with_goods` + settled receivables (`amount_due < 1`, monthly view 32-55).
Intent: gross margin per item/period. Verdict: intent sound. Defects: three different source/inclusion rules → numbers disagree across tabs; cost = purchase price at sale time (no FIFO/AVCO); dead in-loop receivable check.
**Corrected:** one canonical revenue line source (posted invoice lines), COGS from the stock ledger at the sale's cost basis (configurable method), one receivable-inclusion policy (accrual: include all sales; cash-basis variant separately labeled), margins property-tested to tie to the income statement.

**C-13. Inventory valuation** — today: `items.quantity × items.purchase_price`; historical: next `stock_manager` entry's `opening_stock × cost_price` (fallback latest ≤ date) (`inventory_report.php:88-132`); `view_items.php:146-148` same product.
Defects: nondeterministic same-day multi-user pick; float.
**Corrected:** valuation = on-hand at date (from ledger) × cost basis at date (AVCO by default); single valuation routine shared by inventory report, balance sheet and closing stock.

**C-14. Transfer valuation** — `Σ quantity × stock_manager.selling_price` of the latest row for the item from any user/date (`item_transfer_report.php:404-407,438`).
Defect: nondeterministic price pick. **Corrected:** value transfers at the item's cost basis at date; transfers are not sales — margin reports must exclude them.

**C-15. Backlog closing** — `closing = opening + stock_in_today − Σ quantity_picked − Σ transfer qty`; `if date==today: closing = items.quantity` (`get_backlog_report.php:202-207`).
Defects: queries non-existent `item_units.quantity_per_unit` (160-164); sales unfiltered by cashier while transfers are (128-136).
**Corrected:** ledger-derived closing at any date; per-shift and per-item filters consistent.

## Receivables / payables math

**C-16. Customer balance derivation** — `AR = Σ invoice.amount_due (>0)`; cash credit = `abs(Σ amount_due (<0))`; goods owed = `Σ price × quantity_due` (`Admin.php:23483, 24670`; customers_list.php:67-82).
Intent: sign-convention balance. Verdict: intent sound (credit = negative). Defects: derivation scattered and repeated with subtle differences; control account updated separately (drifts).
**Corrected:** single subledger query service; control account reconciled by invariant test nightly; credit tracked as explicit credit documents.

**C-17. Receipt FIFO allocation** — per invoice `amount_paid += x; amount_due -= x`; remainder cascades; last invoice may go negative (`Admin.php:16842-17231`); specific-invoice branch multiplies by account count (**D1** — every per-account statement uses the total: 17270-17438).
**Corrected:** allocation engine writing explicit `payment_allocation` rows; per-tender amounts; over-allocation only allowed as deliberate credit; invariant `invoice.amount_due ≡ amount − Σ allocations − Σ credits`.

**C-18. `prev_paid` / `p_prev_paid`** — "previous paid" snapshots for edit/delete reversal, half-maintained (live only in `payments_received('update')` 17842, 18770 and `delete_payment_received` `Crud_model.php:570-580`; the payable-side writes are commented out, 14600-14688).
Verdict: defective mechanism. **Corrected:** no mutable history → no need for prev_paid; reversals are new documents; migration discards these columns after reconciliation.

**C-19. Edit-diff engine** — `diff = new_paid − SUM(payment.amount of receipt)`; positive → allocate delta; negative → reverse-walk invoices deleting payment/journal rows (`Admin.php:17793-17797, 19355-19377`).
Verdict: replace. **Corrected:** edit of a posted receipt = void + reissue (or adjustment document); no in-place mutation; audit-complete.

**C-20. Negative-bal (credit → goods) accounting** — `grand_total = hidden_total + balance_due` (10559); journals use the same (10702); AP reduced by old credit then AR increased by `hidden_total − amount_paid` or AP increased by `abs(hidden_total)` (10616-10644); credit-consumption sweep zeroes negative amount_due rows (10647-10676); deposit waterfall writes `cash_deposit_disbursement` (10773-10917); update path restores disbursements in reverse (11644-11756).
Intent: spend customer credit on goods. Verdict: intent sound; mechanism D. Defects: `$customer_id` undefined at 10921; grand_total stores credit inside the sale total (report contamination).
**Corrected:** credit applied as a **payment tender** (internal credit tender) against a normal sale; disbursement ledger becomes `credit_application` rows; sale totals never include credit.

**C-21. Refund amount** — `item_amount = price × quantity_returned`; order recomputed to `hidden_total` (new), AR diff formula at 10117; cash-account same-account delta `amount_paid − amount_received_earlier` (10364) (`Admin.php:9908-10364`).
Defects: writes non-existent columns (flow broken vs schema); stock re-return inflation (D22).
**Corrected:** credit-note document with per-line amounts from the original invoice lines (price + allocated discount + tax reversal); refund as separate payment document; stock restock movement with disposition.

**C-22. Customer statement running balance** — `balance += (debit − receipts − deposits)` per so_code; weekly `d_balance_tempt = d_balance + prev_balance` (`customer_statement.php:1294-1336`); grand row mixes cumulative/weekly (1366-1368).
**Corrected:** statement = ordered document rows (invoices, receipts, credit notes, deposits) with true date filtering; opening balance as a document; grand totals consistent; property test vs subledger balance.

## Purchasing / payable math

**C-23. PO totals & status** — same duplicated-per-row pattern and strict-`===` ladder as sales (`Admin.php:4673-4685`); AP row `amount_due = grand_total − amount_paid` (4854).
**Corrected:** header-level totals; GRN-based stock; supplier invoice document; per-invoice allocation (mirrors C-17).

**C-24. Payable payment** — `accounts_payable.amount_paid += x; amount_due −= x`; status incl. Over Paid; mirrored to `purchase_order`; AP control and paid-from accounts adjusted (`Admin.php:14841-14966`).
Verdict: intent sound. **Corrected:** same allocation-engine treatment as receipts.

**C-25. Expense posting** — Dr allocated account / Cr paid-from; allocated `+= amount`, paid-from `−= amount` (15028-15094); edit path hardcodes `'General Office Expenses'` matcher (16307).
**Corrected:** expense document with FK'd accounts; edit = reversal + new document.

**C-26. Deposit maths** — `amount = amount_due = −amount_received` (16390-16394); edit diff `amount − abs(prev amount_due)` applied to both columns (16581-16619).
Verdict: credit model sound (as unapplied cash). **Corrected:** credit documents with explicit application records (see C-20).

## Financial statements

**C-27. Trial balance** — `GROUP BY account_name` sums of debit/credit; balanced if `|ΣD−ΣC| < 0.01` (`trial_balance_report.php:32-158`).
Defects: orphan names vanish; opening balances ignored.
**Corrected:** id-keyed accounts; TB includes opening balances + movements + closing; ties to balance sheet by construction.

**C-28. Balance sheet** — cash: latest `account_balance` snapshot ≤ date; inventory: last `item_balance × purchase_price`; debtors/creditors: **frozen snapshot tables**; equity = plug (`balance_sheet_report.php:46-271`).
Defects: D7 frozen data; snapshot balances instead of computed; equity not a real account.
**Corrected:** all balances computed from ledger/documents at date; real equity accounts (capital, retained earnings, current-year result) with closing entries; accounting periods.

**C-29. Income statement (cash basis)** — revenue = Receivable payments; COGS = **Payable payments**; expenses = Expense payments; mixed string/numeric date filters (`income_statement_report.php:47-78`).
Verdict: D. **Corrected:** accrual P&L: revenue = posted sales in period; COGS = cost of goods delivered in period (from stock ledger); expenses = posted expense documents; cash-basis variant offered separately, clearly labeled.

**C-30. Cash flow** — opening/closing from snapshots; inflows = Receivable payments; outflows = **all POs** (credit purchases counted) + payable payments without po_code + expenses (`cash_flow_report.php:56-178`).
Verdict: D (hybrid). **Corrected:** direct method from receipt/payment documents; transfers excluded (net-zero); deposits/refunds correctly classified; reconciliation to closing cash balances by invariant.

**C-31. `update_ables` rebasing** — POS page computes `grand_total` (AR: invoice.amount_due>0 + |AP.amount_due<0|) / `grand_total_p` (AP: |invoice.amount_due<0| + AP.amount_due>0 + outstanding_debts.amount_due>0 + Σ sales_order.price×quantity_due) and **overwrites** control accounts + latest journal snapshots (`get_main_page.php:36-93, 691-706`; `Admin.php:24775-24817`).
Verdict: D — the single most dangerous accounting behaviour in the system. It exists to mask drift from C-17/C-18 defects.
**Corrected:** delete the mechanism; control accounts derived from subledgers; drift surfaced by a reconciliation job instead of hidden.

## Document codes

**C-32. Code generation** — booklet allocation, client-side SO surgery, timestamp receipts (`[document-numbering.md](document-numbering.md)`).
**Corrected:** server-side atomic sequences; booklet import mode preserved; uniqueness DB-enforced.

---

## Cross-cutting corrected invariants (to be property-tested in the rebuild)

1. `debits == credits` for every posted journal entry (DB constraint + test).
2. `invoice_total = Σ line.net + tax − order_discount` (± allowed adjustments).
3. `amount_due ≡ invoice_total − Σ valid allocations − Σ credits` (never negative unless a credit exists).
4. `on_hand(item, location) ≡ Σ stock movements` (rebuildable; no stored drift).
5. Unit conversions conserve physical quantity within declared precision.
6. A completed return/refund produces the exact inverse postings of the original sale (per policy).
7. No paid invoice has a positive due amount absent a documented correction.
8. `Σ tenders == payment.amount` for every receipt; `payment.amount == Σ allocations + change + unapplied`.
9. Control-account balance ≡ subledger aggregate (AR/AP), checked by a scheduled reconciliation job.
