# Inventory / Stock Movement Map

## 1. Where stock lives (the replication problem)

Stock quantity is stored/derived in **at least seven places** with no reconciliation job:

| Store | Type | Meaning |
|---|---|---|
| `items.quantity` | **float** | The authoritative on-hand package quantity (schema:381) |
| `items.unit_quantity` | **float** | Loose-unit (broken-package) quantity, synced from `unit_transfer` (schema:382) |
| `stock_manager` | per-(user,item,day) rows | Opening/stock-in/closing daily sheet (schema:1091-1108, ≈842k rows) |
| `stock_record` | per-PO-line | `q_bought/q_sold/item_balance` (schema:1111-1128) — purchase-side only, `q_sold` never written |
| `purchase_order.item_balance`, `sales_order.item_balance`, `payment_with_goods.item_balance`, `items_transfers.item_balance` | per-row snapshot | `items.quantity` right after that row's mutation |
| `unit_transfer.*_balance` | per-breakout | Package/unit split after breaking a box (schema:1171-1181) |
| `items_in_units_order.unit_balance` | per-unit-sale-line | Unit pool snapshot |

Only `delete_sales_order` cascades snapshot corrections to later rows (`Crud_model.php:930-986`); PO/transfer edits never do — historical `item_balance` drift is proven by the existence of the unreferenced patch endpoint `updateZeroBalanceItems()` (`Admin.php:25835-25869`).

## 2. Movement catalogue (who mutates `items.quantity`)

| Event | Mutation | Evidence |
|---|---|---|
| Item created | set from POST | `Admin.php:4115-4139` |
| PO create | `quantity + order_quantity` | 4738-4742 |
| PO update (change) | `- old` then `+ new` | 5191-5204 |
| PO update (add/remove line) | `+ new` / `- qty` | 5148-5152, 5246-5248 |
| PO delete | `- qty` | `Crud_model.php:341-351` |
| POS sale (package) | `quantity - quantity_picked` — **no availability check** | 6166-6178 |
| POS sale (unit) | `quantity - 1` per broken box + `unit_transfer` breakout | 5993-6099 |
| Picking / re-pick | reverse + reapply | 12848-12865 |
| Refund | `+ prev_returned` then `- picked` | 9921-9954 |
| Transfer create | `quantity - qty` | 23046-23049 |
| Transfer update | reverse + reapply | 23286-23298, 23340-23342 |
| Transfer delete | `+ qty` | `Crud_model.php:1117-1123` |
| Sales-order delete | `+ quantity_picked` | `Crud_model.php:915-928` |

All mutations use raw-SQL arithmetic `set('quantity','quantity ± n', FALSE)` — check-then-act with no locking; concurrent cashiers interleave freely.

## 3. `stock_record` (vestigial)

Written only on purchases (`q_bought = line qty`, `item_balance = line qty`, `cost_price`): `Admin.php:4687-4695`, 5090-5096, 5182-5185. The sales-side insert is commented out (`Admin.php:6161-6162`), and `q_sold` writes exist only in commented blocks (5938-5955, 7911-7928). Types are `bigint` while POSTed quantities are decimal strings and `items.quantity` is float → silent rounding on insert. **Verdict: dead ledger, cannot be used for reconstruction.**

## 4. `stock_manager` (daily per-user sheet)

- One row per (user, item, day): `opening_stock`, `stock_in_today`, `closing_stock`, `opening_timestamp`, `closing_timestamp`, cost/selling price snapshots.
- Writers:
  - item creation seeds row 1 (4148-4157);
  - PO create/update/delete adjust `stock_in_today` — **without `user_id` filter** (4756-4762; `Crud_model.php:353-358`);
  - `clock_in()` snapshots `opening_stock = items.quantity` (private, `Admin.php:24909-24940`);
  - `clock_out()` sets `closing_stock = items.quantity` (private, 24943-24971);
  - cron closes previous day at **18:00** and seeds today's rows (24975-25074; second half dead after `var_dump; return;` at 25119-25120);
  - **first login of the day** closes the latest rows and seeds today's from `items` (`Login.php:225-271`; closing stamp = midnight + 64800s = 18:00);
  - `delete_sales_order` rewrites history forward (967-986).
- **Broken wiring**: the UI clock button posts to `admin/clock_in_out/...` (`top-header.php:197,249,282,318`) but **`clock_in_out()` does not exist in `Admin.php`**; `clock_in/clock_out` are `private` so `manager_helper.php:111,118` cannot call them. Live opening/closing is effectively maintained by first-login SQL + cron.

## 5. POS opening/closing summary screens

- `pages/pos/opening_stock_summary.php` — shows the user's latest `stock_manager` opening snapshot (21-29, 47).
- `pages/pos/closing_stock_summary.php` — totals `closing_stock + stock_in_today` (46-47) — **double-counts today's receipts** since `closing_stock` is already post-receipt.
- `pages/pos/` and `pages/pos-old/` copies are byte-identical.

## 6. Stock reports (exact logic)

### Daily stock report (`get_daily_stock_report.php`)
```
Opening  = stock_manager.opening_stock
Supply   = stock_manager.stock_in_today
Available= Opening + Supply
Out      = Cash + Credit + Deposit + Transfers   (SUM(quantity_picked) per type_of_sales; SUM(items_transfers.quantity))
Expected closing = Available − Out
Actual closing   = last-row item_balance (payment_with_goods OR items_transfers)
```
Alert when actual ≠ expected (188). Defects: `bal_map` only populated when **both** a sale and a transfer exist (59-70); hardcoded "CEMENTS OUT" label (124) betrays the cement-depot origin.

### Backlog report (`get_backlog_report.php`)
```
closing = opening + stock_in_today − SUM(quantity_picked) − SUM(transfer qty)
if date == today: closing = items.quantity
```
Defects: sales not cashier-filtered while transfers are (128 vs 131-133); queries non-existent table `item_units.quantity_per_unit` (160-164).

### Stock margin (see also [calculation-register.md](calculation-register.md) C-12)
- Daily: source `payment_with_goods` for the day, `type_of_sales <> 'Receivables'`; `S = Σ qty×price`, `C = Σ qty×cost_price`, `M = S−C`.
- Weekly: source **`sales_order`** (different table!), ISO-week range; adds averages; net margin subtracts settled discounts.
- Monthly: source `payment_with_goods` **plus** settled receivables (`amount_due < 1`) — a third inclusion rule. Weekly vs monthly are not comparable.
- Cost basis = `items.purchase_price` snapshotted at sale time (`payment_with_goods.cost_price`, `Admin.php:6184-6190`) — not FIFO/AVCO.

### Inventory report valuation (`inventory_report.php`)
- Today: `items.quantity × items.purchase_price`.
- Historical: qty = **next stock_manager entry's `opening_stock`** after the date; price = that entry's `cost_price`; nondeterministic across same-day users (no tiebreaker).

### Transfer valuation
`item_transfer_report.php:404-407,438`: value = `Σ quantity × stock_manager.selling_price` of the **latest row for the item from any user/date** — nondeterministic.

## 7. Item master & transfers (see also [unit-conversion-rules.md](unit-conversion-rules.md))

- `Admin::item` (4075-4396): create/update/delete; quantity **not editable** after create (4254); price change propagates to `items_prices` for all customers (4318-4323); image upload `uploads/item_image/{id}.jpg` (4216-4219); `items_sold_in_units` toggle; duplicate-name gates.
- Dead: `item/bulk_update` branch missing (view posts to it, `edit_items_bulk.php:58`); `price_column` column unused; `modern-add-item.php`/`modern-edit-item.php` orphaned (the modern form posts `units_data` JSON no controller reads).
- Transfers (`Admin::items_transfer`, 22942-23404): receiver is **free text** (`transfer_to` input → `items_transfers.receiver longtext`), `token_no = 'TR'+sha1-prefix` groups the lines, stock check then deduct, `item_balance` snapshot, and **two `general_journal` rows posting quantities (not money)** — Dr receiver / Cr item name, `journal='Item Transfer'` (23062-23105) — quantities written into `debit_amount`/`credit_amount` columns of the financial journal. Edit flow has an undefined `$item` cleanup bug (23309-23321); delete restores stock and deletes journal rows by token (`Crud_model.php:1109-1137`).

## 8. Corrected model (target)

- **Immutable stock ledger** as source of truth: every quantity change is an append-only `stock_movement` row (item, location, unit context, qty signed, reason, source document, running balance optional).
- On-hand = derived/rebuildable; per-location (warehouse/depot/shop), not global.
- `stock_manager`'s real business intent (per-cashier daily accountability sheet) becomes **cashier shift + stock count sessions**, keyed to shift not calendar day, with no cross-user contamination.
- Oversell policy per item/tenant; negative stock allowed only when explicitly configured and always visible.
- Transfers become **location-to-location documents** with in-transit state, and never touch the financial GL.
- Item history = query over the ledger, not `item_balance` archaeology.
