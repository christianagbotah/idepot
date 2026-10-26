# Purchase / Procurement Lifecycle Map

## 1. As-built lifecycle

The legacy system **collapses PO, goods receipt and supplier invoice into a single "purchase order" event**. Stock is added the moment the PO is saved; there is no ordered-vs-received distinction, no GRN, no supplier-invoice document, and no approval step.

```
PO created ──► stock in (immediate) ──► AP row created ──► payments (now or later, per PO)
     │                                                              │
     └── edit (guarded) / delete (guarded) ◄────────────────────────┘
```

### 1.1 PO creation — `Admin::purchase_order('create', $ids)` (`Admin.php:4601-4965`)

1. `po_code` (+ `track_code = substr(sha1(md5(mt_rand(...))),0,15)`, 4603), `supplier_id`, `date_timestamp = strtotime(order_date)` (4611-4619).
2. **One `purchase_order` row per item line**; `grand_total`, `amount_paid`, `amount_due` duplicated onto every row (4673-4677).
3. Status ladder with the same strict-`===` defect as sales (4679-4685):
```php
if ($amount_paid == 0)          $status = 'Unpaid';
elseif ($amount_paid < $total)  $status = 'Partially Paid';
elseif ($amount_paid === $total) $status = 'Paid';   // overpayment → NULL status
```
4. **Stock in**: `items.quantity + order_quantity` (4738-4742); `stock_manager.stock_in_today += qty` for *all users'* rows that day (4756-4762); `stock_record` row with `q_bought = quantity`, `item_balance = quantity` (4687-4695 — a line snapshot, not a running balance; `q_sold` is never written, see [stock-movement-map.md](stock-movement-map.md) §3).
5. Accounting: `General Products Purchased.current_balance += total` (4771-4785); 2 `general_journal` rows (`journal='Purchases'`: Dr General Products Purchased / Cr Accounts Payable, 4787-4820).
6. `accounts_payable` row per PO: amount/amount_paid/amount_due/status/account_id/track_code (4822-4851).
7. Payment at PO time (cash purchase): `payment` row (`payment_type='Payable'`, 4862-4880) + `journal='Payments'` pair (4884-4918) + paid-from account decrement (4921-4925). Cash-account balance validation 4622-4635.
8. Known bug: supplier address update uses undefined `$supplier_id` (4954) — silently no-ops.

### 1.2 PO numbering
- `Ajax::getPOCodeForNewOrder()` (`Ajaxdataload_model.php:1894-1938`): take the lexicographically-largest `po_code`, locate the **second numeric character** by string surgery, `+1`. Fragile; any prefix containing digits breaks it.
- Verification: `Crud::verify_po_no` (`Crud_model.php:1140-1159`); insert-time gate `p_order_validation_insert` (`user_validation_helper.php:292-315`).
- Opening POs use literal `'Opening-or…'` codes; `isOpeningPo()` (`Crud_model.php:276-292`) blocks editing them unless single-row.

### 1.3 PO edit (`'update'`, 4968-5594)
- Guard: refused if >1 `payment` rows exist (4988-4996).
- Line change → reverse (`quantity - old`) then reapply (`quantity + new`) (5191-5204); added line → insert path; removed line → stock reversed + row deleted (5246-5271).
- GL: `General Products Purchased` reversed then re-added (5277-5285); journals updated by `po_code` (5287-5333); `accounts_payable` updated (5335-5365); `payment` rebuilt; paid-from account rebalanced incl. account switch (5536-5558).
- **Fatal-risk bug**: `where_not_in('account_name', $account_names_array)` at 5468/5564 references a variable **never defined in this function** → broken SQL on every PO edit that touches payments.

### 1.4 PO delete — `Crud_model::delete_purchase_order` (295-423)
Blocked if any `payment` rows exist; otherwise restores stock/`stock_in_today`, adjusts AP + GPP accounts, deletes rows from `purchase_order`, `accounts_payable`, `general_journal`, `payment`.

### 1.5 Paying later — `Admin::payments('create', 1, 'su_<id>')` (`Admin.php:14831-14978`)
- Supplier + specific `po_code`: `accounts_payable.amount_paid += x`, `amount_due -= x` (14841-14849); status recomputed incl. `'Over Paid'` (14860-14871); mirrored onto `purchase_order` (14881-14888); `Accounts Payable.current_balance -= x`, paid-from `-= x` (14890-14906); `payment` + Payments journal pair (14915-14966).
- **General supplier payment (`po_code='0'`) is fully commented out** (14574-14827) — silently does nothing and never responds.
- Debt (`de_<id>`) and negative-customer (`ce_<id>`) branches: see [payment-transaction-map.md](payment-transaction-map.md).

### 1.6 Manual payables — `Admin::enter_payable` (13554-14132)
Creates `accounts_payable` rows with synthetic code `'LPAY-'.substr(strtotime('now'),5)` (13582) — for suppliers (Dr allocated account / Cr AP, `journal='General'`), customers (negative `invoice` rows, 13585-13593), or `outstanding_debts` (loans/other payables, 13755-13798).

### 1.7 Reports
`purchase_order_report` (`Admin.php:943-957`; view groups PO rows per `po_code`, `SUM(quantity)/SUM(amount)/MAX(amount_due)/MAX(price)`), `credit_purchases_report` (1559-1581; `accounts_payable.amount_due > 0`), `payables_taken_report` (1532-1556; see [ar-ap-lifecycle.md](ar-ap-lifecycle.md) §6).

## 2. Status / type values found

| Field | Values | Set by |
|---|---|---|
| `purchase_order.status`, `accounts_payable.status` | `Unpaid`, `Partially Paid`, `Paid`, `Over Paid`; dead `'Open'` in commented branch | 4679-4685, 4842-4848, 14860-14871 |
| `type_of_payment` (column) | — | **Never read or written — dead column** |

## 3. Business rules to preserve

- One PO groups many item lines under a shared `po_code` + `track_code`.
- Cost price of an item is updated to the latest PO line price (`purchase_order` price → `items.purchase_price` effectively via margin usage; cost snapshot per sale row comes from `items.purchase_price` at sale time).
- AP per PO tracked in `accounts_payable` with per-PO allocation of payments.
- Opening payables/loans entered manually with `LPAY-` codes; supplier opening balance → `'Opening-balance'` AP row (`Admin.php:2202-2212`).

## 4. Corrected model (target)

Separate the concepts the legacy app collapsed:
- **purchase_order** (header + lines, statuses `draft → issued → partially_received → received → closed/cancelled`);
- **goods_receipt (GRN)** — the stock-affecting event, referencing the PO line, allowing over/under receipt with variance;
- **supplier_invoice** — the AP-affecting event, matched to GRN/PO (3-way match);
- **payment + allocation** to supplier invoices.
Plus: approval thresholds, landed-cost allocation option, supplier statement, and returns-to-supplier (credit notes) — none of which exist today (supplier returns are entirely absent from the legacy system).
