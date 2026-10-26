# Sales / POS Lifecycle Map

The single most important business flow in iDepot. This document reconstructs, from code, how a sale actually happens — including all **five order variants**, the status model, and the picking/delivery loop.

## 1. Variant inventory

| Variant | Route | Engine (Admin.php) | Purpose | Status |
|---|---|---|---|---|
| **POS sale** | `admin/pos` → AJAX `admin/sales_order_pos/create/...` | `sales_order_pos` (5760-6798) | The live front-desk sale engine | **Active** |
| POS edit | `modal/popup_pos/edit_sales_order` → `sales_order_pos/update` | `sales_order_pos('update')` (6801-7717) | Edit a posted order (rewrites history) | Active |
| POS delete | `sales_order_pos/delete` (7720-7738) | → `Crud::delete_invoice` / `delete_sales_order` | Destructive delete with reversals | Active |
| **Alterated fork** | `admin/sales_order_pos_alterated/*` | 7743-9807 (~2,065 lines) | Near-clone with *different* stock checks & payment math | **Dead** — zero view references |
| **Payment-with-goods (picking)** | `admin/payment_with_goods/create/...` | 12291-13553 | Deliver owed goods later against a waybill | Active |
| **Negative-bal sale** | `admin/sales_order_negative_bal/create|update` | 10399-12287 | Cash-creditor settles goods against customer credit | Active |
| **Proforma** | `admin/create_proforma_invoice/create` | 5610-5756 | Quotation; writes `proforma_invoice_order` + `proforma_invoice` only | Active |
| Add-sales-order modal | `pages/sales/add_sales_order.php` | posts to **non-existent** `admin/sales_order/create` | Legacy flow | Broken |

## 2. Live POS flow (step by step)

1. **Shell** — `admin/pos` renders `pages/pos/pos_page.php` (attempts cashier clock-in via `admin/clock_in_out/update_clock_out/` — endpoint missing, see [stock-movement-map.md](stock-movement-map.md) §4). `pos_page.php:248,315-329` loads `admin/get_pos_main_page` → `pages/pos/get_main_page.php`.
2. **Bootstrap** — `get_main_page.php` computes the next **so_code client-side** (lines 100-166, duplicating `Ajax::getSOCodeForNewOrder` logic), loads item tiles (`admin/get_all_invoice_items` → `Admin.php:25448`), customers (`admin/get_customers` → `Admin.php:25454`), and the invoice-code booklet widget (`admin/getInvoiceCodeSection4Verification` → `Admin.php:25747` → `Crud::getGeneratedInvoiceCode`, `Crud_model.php:3126-3134`).
3. **Balance self-repair** — `update_ables_pos()` (get_main_page.php:691-706) POSTs browser-computed totals to `admin/update_ables` (`Admin.php:24775-24817`) which **overwrites** `accounts.current_balance` for AR/AP and the newest `general_journal` snapshots. (Defect: non-authoritative ledger.)
4. **Item selection** — item tile → `admin/confirm_item_selection/<id>` (`Admin.php:24832-24854`); if `items.item_sold_in_units=1` a unit-picker modal appears (`admin/item_unit_selection_pos` → `pages/pos/get_item_unit_list.php`).
5. **Order row** — `add_new_row_pos()` fetches a row fragment: package → `admin/add_order_row_pos` → `pages/add_order_row_pos.php`; unit → `admin/add_order_row_pos_unit` (→ `..._fixed_quantity.php` for tons, `Admin.php:23747-23756`). Row JS calls `admin/order_item_selected` (→ `Admin.php:23866-24049`) to resolve the unit price (resolution order in [calculation-register.md](calculation-register.md) C-4).
6. **Totals** — client-side JS `grand_total_pos()` sums line amounts, subtracts the **order-level** discount once, writes hidden fields `hidden_total_pos`, `hidden_payment_balance_pos`, `hidden_total_quantity_pos` (`add_order_row_pos.php:204-294`).
7. **Payment capture** — multi-account widgets via `admin/get_account_field` (→ `pages/pos/account_field.php`); cheque/MoMo detail inputs keyed on account-name string matching (`account_field.php:25-37`); `update_amount_paid()` sums `method_amount_<account_id>` (get_main_page.php:1530-1550).
8. **Submit** — form re-verifies the invoice code (`admin/get_generated_invoice_code/<code>` → `Crud::verify_invoice_code`, `Crud_model.php:1185-1197`) then POSTs to `admin/sales_order_pos/create/<input_ids_numeric>/<paymentMethodsIdsNew>` (get_main_page.php:1185). Row input names are suffixed with `strtotime('now')` — same-second rows collide (Defect R3).
9. **Server engine** (`sales_order_pos('create')`):
   - duplicate SO/invoice-code guards (5781-5887; helper `s_order_validation_insert`, `user_validation_helper.php:319-341`);
   - per item: INSERT `sales_order` (6156) **and mirror INSERT `payment_with_goods`** (6198) — every POS sale writes both tables;
   - stock: package sale → `items.quantity - quantity_picked` (6166-6178) with **no stock-availability check** (only unit sales are checked, 5846-5854); unit sale → `unit_transfer` breakout + `items_in_units_order` (5961-6113, see [unit-conversion-rules.md](unit-conversion-rules.md));
   - `item_balance` + `cost_price` snapshot back-filled by UPDATE (6181-6206);
   - `items_prices` auto-backfill (6214-6239 — bug: `customer_id` never set, gated on last iteration);
   - accounting: `General Sales.current_balance += total` (6243-6254), `Accounts Receivable.current_balance += total`, 2 `general_journal` rows (`journal='Sales'`: Cr General Sales / Dr AR, 6260-6293);
   - `invoice` row (6297-6328) + `invoice_code` booklet row → `closed` (6530-6533);
   - if paid: per-account `payment` rows (`payment_type='Receivable'`, 6399-6432), Receipts journal pairs (6448-6503), account balance updates (6484-6508), overpayment → `Accounts Payable += |due|` (6440-6445);
   - receipt_code = `'DP1REC-'.YmdHis` (6336); SMS/email composed inline (6586-6744);
   - customer address update (6523-6527).
10. **Receipt** — response JSON → loads `admin/receipt/<code>/<customer>/<date_time>/<printer>/pos` → thermal `pages/sales/receipt_pos.php` (printer=1) or A4 `pages/sales/receipt.php` (`Admin.php:24739-24764`).

## 3. Post-sale flows

- **Lists** — `pages/sales|pos/sales_order_list.php` (DataTables fed by `admin/get_sales_order_list` → `Crud::get_sales_order_list`, `Crud_model.php:2182+`; queries run against **`payment_with_goods`**, `Ajaxdataload_model.php:53-93`). Row actions: Edit / Refund / Preview / Delete (`sales_order_list.php:886-909`).
- **Edit guard** — `admin/can_edit_order/<so_code>/sales` is **broken**: looks up `so_id` with a so_code value (`Admin.php:24570`), always returns `'yes'`. The "orders with waybills cannot be edited" rule never fires.
- **Edit** — `modal/popup_pos|popup_sales/edit_sales_order` re-renders saved rows by stored `html_id`, submits to `sales_order_pos('update')` (6801-7717): UPDATE/INSERT/DELETE `sales_order` + `payment_with_goods`, restore-then-reapply stock, **cascade `item_balance` rewrites over all later rows** (7211-7237), rewrite `stock_manager` for all later dates (7245-7270), adjust GL accounts and journals, rebuild `payment` rows.
- **Delete** — `Crud::delete_sales_order` (`Crud_model.php:738-1106`): restores stock, cascades snapshots, adjusts accounts, deletes rows from 5 tables.
- **Picking / delivery** (`payment_with_goods('create')`, 12291-13553) — for customers with `quantity_due > 0` (detected by `is_creditor`, `Admin.php:24080-24104`): loads undelivered lines (`admin/get_payment_with_goods_order`), cashier enters picked quantities + a verified waybill code; engine sets `type_of_sales='Payables'`, `waybill_code`, increments `quantity_picked`, recomputes `quantity_due = quantity - quantity_picked` (12510-12511), handles unit re-cracking, closes the `waybill_code` booklet row (13180-13183), updates invoice + Sales journals when items changed, optionally takes cash (13189-13262).

## 4. Status model (as-built)

### `sales_order.status` / `payment_with_goods.status`
Ladder at create (`Admin.php:6120-6133`, update 7030-7048, negative-bal 10524-10536, picking 12727-12734, payment engine 16884-16903):

```php
if ($amount_paid == 0)            $status = 'Unpaid';
elseif ($amount_paid < $total)    $status = 'Partially Paid';
elseif ($amount_paid === $total)  $status = 'Paid';   // strict string compare on raw POST
```
- `'Over Paid'` is set **only** by the payments engine (`Admin.php:16888`, `Crud_model.php:594`) — the create-time ladder has no overpayment branch; strict `===` on POST strings drops the status when formats differ (`"500"` vs `"500.00"`).
- Same ladder for `invoice.status` (6319-6325, 7420-7427, 10756-10767).

### `type_of_sales`
- `'Receivables'` — unpaid/partial credit sale (6121, 6125).
- `'Cash'` — fully paid (6128; forced unconditionally in negative-bal 10428).
- `'Payables'` — paid but goods still owed / being picked (6130-6132; `payment_with_goods` create 12335).

### `negative_or_goods`
- `'goods'` — undelivered quantity exists (6195-6197);
- `'negative'` — cash-creditor settlement rows (10512);
- `'debtors'` — debtor opening-balance SOs (checked in `Crud::delete_sales_order`, `Crud_model.php:747-749`);
- `NULL` — plain POS rows.

### Quantity semantics
- `quantity` — ordered; `quantity_picked` — delivered so far; **`quantity_due = quantity - quantity_picked`** (5935, 7013, 10516, 12511) — drives goods-creditor AR/AP math (`price × quantity_due`).
- `total_quantity` — order-level item-count sum, duplicated per row.
- `opening_entry=1` — customer opening-balance rows, excluded from lists (`Ajaxdataload_model.php:54,64`).

## 5. Proposed replacement lifecycle (target model)

The audit shows the real business needs: quotation → order → partial payment → partial delivery → final settlement → possible return. The new system will use an explicit, validated state machine per the master prompt:

```
draft → held → confirmed → picking → picked/partially_picked → dispatched
      → invoiced → part_paid/paid/overpaid → partially_returned/returned
      → closed | voided
```

with: per-line amounts (no per-row grand_total duplication), server-computed totals & statuses (decimal compare with explicit overpaid branch), atomic code allocation, stock reservation at confirm (oversell policy configurable per item), separate credit-memo documents for returns (never in-place edits), and `payment_with_goods` folding into a `fulfillment/delivery` sub-aggregate (waybill = delivery document).

## 6. Key defects (full detail in [defects-and-risks.md](defects-and-risks.md))

- R1 no stock check for package sales on the live engine (5835-5862);
- R2 views posting to non-existent `admin/sales_order/*` endpoints (pos list delete, add_sales_order, preview_order, edit_payment_with_goods, view_invoices delete);
- R3 same-second row-id collisions;
- R4 strict `===` status bugs;
- R5 broken `can_edit_order` guard;
- R6 race conditions in every code allocator;
- R9 discount makes `Σ line.amount ≠ grand_total` (invoice print shows the sum);
- R14 `grand_total`/`total_quantity`/`amount_paid`/`amount_due` duplicated on every row;
- R16 edit of multi-payment orders can double-post journals (guard counts unique accounts, not payments, 6854-6861).
