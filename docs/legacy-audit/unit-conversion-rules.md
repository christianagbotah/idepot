# Package / Unit Conversion Rules

## 1. Data model (as-built)

| Table | Role | Key columns |
|---|---|---|
| `packages` | list of package types ("box", …) | `package_id`, `package_name` (schema:595-598) |
| `items.package_id` | the item's primary sellable package | (schema:390) |
| `units` | list of units ("piece", "yard", "ton (t)"…) | (schema:1183-1186) |
| `units_items` | per item+unit: **`unit_total` = how many units make one package** (e.g. 12 pieces/box), default `unit_price` | (schema:1189-1196) |
| `unit_transfer` | breakout ledger when a package is broken into units | `package_quantity`, `unit_quantity`, `package_quantity_balance`, `unit_quantity_balance` (schema:1171-1181) |
| `items_in_units_order` | per unit-sale line | `quantity`, `unit_price`, `total_amount`, `unit_balance`, `sales_order_code` (schema:400-417) |
| `items_prices` | per customer+item **package** price (unique `(item_id, customer_id)`) | (schema:419-429) |
| `items_units_prices` | per customer+item **unit** price — ⚠️ unique key omits `unit_id` | (schema:457-470) |
| `items.item_sold_in_units` | enum('0','1') — item can be sold loose | (schema:389) |
| `items.quantity` / `items.unit_quantity` | package stock / loose-unit stock | (schema:381-382) |

`sales_order.order_item_has_unit_sales` enum('0','1','2'): **0** = package sale; **1** = sold in smaller unit; **2** = sold as bundle/ton derived from pieces (comment `Admin.php:5908-5912`).

## 2. The breakout algorithm (selling pieces when stock is in boxes)

Selling `quantity_picked` pieces (`Admin.php:5960-6113`; duplicated in `sales_order_pos_alterated` 7945-8087 and `payment_with_goods` 12545-12684):

1. `unit_total = units_items.unit_total` for (item, unit) (`Crud::getItemUnitQuantity`, `Crud_model.php:2936-2943`).
2. **No transfer row yet & `items.quantity > 0`**: break one box —
```php
insert unit_transfer(package_quantity=1, unit_quantity=unit_total,
                     package_quantity_balance=1, unit_quantity_balance=unit_total);
items.quantity -= 1;                                  // Admin.php:5982-5996
unit_transfer.unit_quantity_balance -= quantity_picked; // 5999-6001
```
3. **Existing row, insufficient units** (`available_unit_q < quantity_picked`):
```php
$balance = quantity_picked - available_unit_q;        // Admin.php:6036
// zero out the PREVIOUS transfer row (both balances → 0)   6059-6062
// insert a NEW row breaking another box; items.quantity -= 1;  6039-6053
// new row: unit_quantity_balance -= $balance                    6065-6067
```
4. Exact exhaustion → previous row balances zeroed (6072-6077); otherwise `unit_quantity_balance -= quantity_picked` (6080-6083).
5. Write `items_in_units_order` line (`quantity`, `total_amount = quantity × price`, `unit_balance = getUnitItemBalance()`) and sync `items.unit_quantity` to the **max-transfer_id row's `unit_quantity_balance`** (`Crud_model.php:2910-2921`; `Admin.php:6092-6111`).

**Invariant:** package stock and unit stock are one physical pool — breaking a box moves 1 package → `unit_total` units; selling a package does **not** touch `unit_transfer`; selling pieces only consumes a package when the unit pool is short.

## 3. Ton / bundle sales

- Unit named `'Ton (t)'` triggers the fixed-quantity row view (`add_order_row_pos_unit_fixed_quantity.php`, routed `Admin.php:23747-2356`).
- JS derives pieces from tonnage: `total_quantity_main = item_unit_quantity × quantity` but the money line is `quantity(bundle) × unit_price(bundle)` (`add_order_row_pos_unit_fixed_quantity.php:222-231`).
- Stored with `order_item_has_unit_sales='2'`, `bundle_quantity`, `bundle_price` (`Admin.php:5918-5924`).

## 4. Report-side conversions

- Pieces → packages: `qty = quantity / unit_total` (margin reports daily `:179-183`, weekly `:165-170`, monthly).
- Backlog: `if (unit_quantity_t > unit_total_t) { unit_to_package_t += unit_quantity_t / unit_total_t; } else { unit_to_package_t = unit_quantity_t; }` (`get_backlog_report.php:226-230`).

## 5. Unit administration

- `Admin::addItemUnits` (25310-25448): add/clear units per item from add/edit item pages; `items_sold_in_units` forced '1' when units exist, '0' when cleared; on item create, orphan `units_items` rows are bound via `WHERE timestamp = $timestamp` (`Admin.php:4143-4146`) — **same-second race: two items created in one second steal each other's units**.
- `get_available_units_ids.php` renders remaining unit options; `getItemUnitsByItemId` (25427) lists them.
- Item edit copies `units_items.unit_price` into `items_units_prices` per customer (4335-4345) — but the unique key `(item_id, customer_id)` ignores `unit_id`, so multi-unit items keep only one price row per customer (schema defect).
- `updateUnitQuantity()` maintenance endpoint re-syncs `items.unit_quantity` from the last `unit_transfer` row (25958-25992; fired from dashboard `pages/dashboard.php:309`).
- Transfers: the transfer UI offers unit/package choice (`add_item_transfer.php:207-234`) but the controller never consumes unit fields — unit semantics are display-only in transfers.

## 6. Price resolution with units

`Admin::order_item_selected` (23866-24049):
1. Unit sale: `items_units_prices` per customer+item (**no unit_id filter**, date filters commented out) → else `units_items.unit_price`.
2. Package sale: `items_prices` per customer+item (`last_row()`, **no ORDER BY**) → else `items.selling_price`.
3. Purchase rows: `items.purchase_price`.

## 7. Defects (see [defects-and-risks.md](defects-and-risks.md))

- U1: float quantities → conversion drift (`quantity / unit_total` non-terminating decimals).
- U2: `package_quantity_balance` only ever 0/1 — cannot represent breaking 2+ boxes in one row; algorithm relies on multiple rows + zeroing.
- U3: same-second `units_items` binding race.
- U4: `items_units_prices` unique key omits `unit_id` — one price per customer per item regardless of unit.
- U5: unit-price lookup ignores `unit_id` (23877-23881) — arbitrary price when multiple units priced.
- U6: `items.unit_quantity` synced from "max transfer_id" row — historical corrections break the sync; `updateUnitQuantity` is a manual patch.
- U7: transfers ignore units entirely (no `unit_transfer` writes) — transferring "5 pieces" deducts 5 packages from stock.

## 8. Corrected model (target)

- Product base unit (SMU) + configurable purchase units and sale units with **exact decimal conversion factors** per product (`unit_total` generalized).
- Single stock pool per product+location in **base-unit quantity**; selling in any unit converts at transaction time and stores both the transacted unit/quantity and the base quantity — no separate package/unit balances to drift.
- Integer-safe arithmetic: quantities as `numeric(18,6)`; conversions validated to conserve physical quantity within precision (invariant test).
- Price lists keyed by (customer segment, product, unit, effective date).
- Bundle/ton sales become a unit with a conversion factor (possibly per-product weight-derived), not a special code path.
- Conversion audit trail: every breakout is a stock movement with reason `unit_break`/`unit_merge`.
