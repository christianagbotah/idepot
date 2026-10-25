# Customer / Supplier / AR / AP Lifecycle Map

## 1. Customer lifecycle — `Admin::customer` (Admin.php:2426-4059)

### Creation
- Fields: `customer_name` (uppercased; the only required field), contact person, address, mobile, phone, email (lowercased), `guest` flag, `customer_active`, `opening_balance` (2438-2462). Phone validated by `validate_phone_number()` if present (2487-2492). **No duplicate check** (commented out, 2582). Not phone-first — name-first; email optional in practice but stored NOT NULL.
- Gate: the `'Accounts Receivable'` account must exist (2592).
- `customers.balance_due` column is **never written** — vestigial; balances are always derived (see §4).

### The three opening-balance mechanisms
1. **Cash opening balance** (2964-3008): an `invoice` row with `so_code = invoice_code = 'Opening-balance'`; positive → `amount = amount_due = opening_balance` (debtor); negative → `amount_paid = abs(...)`, credit balance (creditor). Stored on customer as `opening_accounts_receivable_id`. AR/AP control accounts mutated (2994-3006).
2. **"Also a creditor (goods are with us)"** — `is_a_creditor==1` (2505-2539, 2613-2785): per-item **opening sales orders** (`opening_entry=1`, `negative_or_goods='goods'`, `status='Paid'`, `quantity_due = quantity − quantity_picked`) + `payment_with_goods` mirrors; `customers.opening_so_code`; journal rows with deliberately zero amounts (2726, 2744). **The AP update using `Σ(quantity_due × price)` is commented out** (2693-2701) — goods-creditor openings do not move AP at creation.
3. **"Debtor's balance (unpaid goods)"** — `debtor_is_a_creditor==1` (2544-2578, 2790-2962): mirror flow with `negative_or_goods='debtors'`, `status='Unpaid'`, `amount_due = debtor_hidden_total`, `quantity_picked = quantity`; `customers.debtor_opening_so_code`; `opening_accounts_goods_receivable_id`.

UI: `pages/sales/add_customer.php:136-166`; order forms via `admin/get_debtor|creditor_opening_balance_order` (24622-24655). Form tag points to non-existent `admin/create_customer/create` but JS posts to `admin/customer/create` (add_customer.php:24 vs 349).

### Edit (3026-4059)
- SO-code change blocked for opening orders (3120-3124, 3236-3240); item changes blocked once a non-opening pick exists (3142-3166).
- Un-ticking creditor/debtor flags **deletes the opening order and subtracts from AP/AR** (3184-3203, 3258-3263) — asymmetric vs creation (which never added; see defect D9 in [defects-and-risks.md](defects-and-risks.md)).
- Cash opening-balance editing: four direction branches mutate the `Opening-balance` invoice row (3935-3980); global accounts adjusted **only** in the insert path (3986-4032) — drift in the update path (D10).
- Blocked if any payment references the opening balance (3294-3300).

### Delete — `Crud_model::delete_customer` (105-225)
Blocked if any `general_journal`/`payment`/`sales_order` rows exist. Otherwise adjusts AP/AR and deletes `customers`, `invoice`, `prices`, conditional `sales_order` rows — **`payment_with_goods` rows are not cleaned**.

## 2. Supplier lifecycle — `Admin::supplier` (2120-2423)

- Creation: required name/contact/address/mobile; duplicate check **active** (`supplier_validation_insert`, 2186); AP account gate (2196). Opening balance → `accounts_payable` row `po_code='Opening-balance'` (2202-2212), stored as `suppliers.opening_accounts_payable_id`. Sign convention: positive = we owe (AP +=), negative = supplier owes us (AR +=) (2222-2237).
- Edit: opening-balance row incremented by difference (2359-2371); global accounts **never adjusted on edit**.
- Delete: blocked if journal/payment/PO rows exist; else adjusts AP/AR and deletes supplier + AP rows + all `purchase_order` rows (72-88). No active/inactive flag exists for suppliers.

## 3. AR/AP ledger mechanics (as-built)

There is **no ledger** for AR/AP in the accounting sense; balances are derived on demand:

| Question | Derivation | Evidence |
|---|---|---|
| AR per customer | `SUM(invoice.amount_due) WHERE amount_due > 0` | `get_receivable`, `Admin.php:23483` |
| Cash payable to customer (credit) | `abs(SUM(invoice.amount_due)) WHERE amount_due < 0` | `get_negative_balance`, 24670 |
| Goods payable to customer | `Σ(price × quantity_due)` over `sales_order` | customers_list.php:73-77 |
| AP per supplier | `SUM(accounts_payable.amount_due) WHERE amount_due > 0` | `get_payable`, 23460 |
| Supplier overpayment | `accounts_payable.amount_due < 0` rows | 23440 |
| Control accounts | `accounts.current_balance` — incrementally mutated, then **overwritten by `update_ables` from POS pages** | 24775-24817 |

### `debtors` / `creditors` — frozen snapshot tables
Per-day snapshots (`debtor_type` ∈ customers/suppliers/outstanding_debts; amounts = the sums above) written only by `debtorsCreditorsUpdator()` — **100% commented out** (1198-1468). Still read by `creditors_report.php:39-46` and the balance sheet → both report balances frozen at the last run (evidence suggests 31-12-2023; `backups_creditors` hardcodes that date, 26003).

### `outstanding_debts`
"Other payables": loans/TNT/expenditure-style debts with their own `account_id` (paid from) and `alloc_acc_id` (allocated account), written by `enter_payable` (13755-13798), paid via `de_` payments. Sign conventions differ per consumer (AP views read `> 0`, AR views read `< 0`).

### "Payables taken"
Goods physically delivered against customer prepayments/credit: `payment_with_goods` rows with `type_of_sales='Payables'` and `quantity_picked > 0`, restricted to SO codes dated before the window start (`get_payables_taken_list.php:30,72,104-123`), amount = `price × quantity_picked` net of order discount, with `'R'`-suffixed reversal codes special-cased (104-111). The `below_year` variant restricts to orders created before Jan 1 of the chosen year (below_date view:21, 115-119).

## 4. Customer statement — `pages/sales/customer_statement.php`

1. Week buckets from a DISTINCT join of `general_journal.timestamp` × `payment_with_goods.date_timestamp` for the customer (1-56).
2. Opening balance row from `customers.opening_balance` (448-498).
3. Sales rows per so_code: AR debit from `general_journal` (`account_name='Accounts Receivable'`, `debit_amount != 0`), picking detail table from `payment_with_goods` grouped by timestamp (510-866). Opening so-codes zeroed for display (830-857).
4. Receipt rows: AR journal credits (872-1231); deposit rows: AP journal credits per so_code (1233-1292).
5. Running balance `$balance += (debit − receipts − deposits)` (1294-1318).
6. **Grand-total defect**: `$grand_dr/$grand_bal` cumulative but `$grand_cr` weekly-only — values assigned inside the loop keep the last week's credits (1366-1368).
7. `from/to` filters only apply to the week-discovery query; in-loop date filters are commented out (424-428 etc.).

Dead variants: `customer_statement-old.php` (no date filter, different week logic), `customer_statement_optimized.php` (uses `invoice.amount` as debit, **omits opening balance and deposit rows** — divergent math).

## 5. AR/AP reports

- `accounts_receivable_report` (1584-1602; view): flat debtors list (`invoice.amount_due > 0` per customer) + `outstanding_debts` negative rows + overpaid suppliers; **no aging buckets**; supplier candidate query uses `$from_ts` **before definition** (view:334-339 vs 347-348).
- `accounts_payable_report` (1471-1502): creditor selector as 2-char prefix + id (`su_/cg_/cn_/de_`); sections: cash creditors (negative invoice dues), outstanding debts, goods creditors (`Σ price × quantity_due` per so_code, reconciled against latest `payment.due`, minus discounts) (view:343-714). `from=='test'` loads the `accounts_payable_report2` debugging view (1492-1498).
- `creditors_report` (1505-1529): reads the **frozen `creditors` table** — only the historical snapshot date returns data.
- `payables_taken_report` / `credit_purchases_report`: see §3 and [purchasing-lifecycle.md](purchasing-lifecycle.md).

## 6. Corrected model (target)

- Customers: phone-first optional-email master data; dedup tooling; credit terms/limits; explicit `customer_credit` documents for opening balances.
- AR subledger = invoices + credit notes + allocations; AP subledger = supplier invoices + debit notes + allocations; control accounts reconciled to subledgers by invariant tests, never overwritten.
- Aging buckets (current/30/60/90/120+), statements regenerated from documents with true date filtering, opening balance as a real document.
- Goods-owing (undelivered paid goods) tracked as **deliveries/fulfillments** on the order, not as an AP figure; the "customer as creditor" concept becomes `customer credit balance` with explicit documents (deposit, refund, credit note).
- Suppliers: active flag, statement, returns-to-supplier (absent today), supplier performance data (feeds AI scoring).
