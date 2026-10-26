# Accounting Transaction-Flow Map

## 1. The "posting engine" (or absence of one)

There is no posting engine and no journal document. Every business event **hand-writes two `general_journal` rows** (one debit, one credit) with a denormalized `account_balance` snapshot, and separately does arithmetic on `accounts.current_balance`. The universal pattern, repeated dozens of times:

```php
$this->db->set('current_balance', 'current_balance + ' . $amount, FALSE);   // raw SQL, raw POST
$this->db->where('name', 'Accounts Receivable')->update('accounts');
$balance = $this->db->get_where('accounts', array('name'=>'Accounts Receivable'))->row()->current_balance;  // read-back (racy)
$this->db->insert('general_journal', array('journal'=>'Sales','account_name'=>'Accounts Receivable',
    'debit_amount'=>$amount, 'account_balance'=>$balance, ...));
```

**No `trans_start()` exists anywhere in Admin.php or Crud_model.php** (verified by search). `general_journal.account_name` is a free-text name, not an FK — renaming an account orphans history (trial balance drops the rows, `trial_balance_report.php:47-57`).

## 2. Chart of accounts

- `accounts` (schema:13-25): `name` (longtext), `account_type` (FK to `account_type`, 5 seeded types), `opening_balance` (**never read by any report**), `current_balance`, `account_is_bank`, `account_is_transferrable`.
- Type semantics inferred from usage: **1 = asset/cash&bank** (balance-sheet/cash-flow filters, `balance_sheet_report.php:49-50`), **5 = expense/allocation** (`Admin::account_allocation`, 24137-24156 — excludes `'General Products Purchased'`), type 3 → `'Accounts Receivable'`. Types 2/4 never referenced by id.
- Hardcoded control-account names used as string keys everywhere: `'Accounts Receivable'`, `'Accounts Payable'`, `'General Sales'`, `'General Products Purchased'`, `'General Office Expenses'`, `'Imprest'`, `'Petty Cash'` (`Admin.php:16925, 14230, 6267, 5283, 16307`; `Crud_model.php:3166-3167`).
- Payment method = a row in `accounts` (Cash, bank accounts, MoMo wallets, Imprest…). `account_is_transferrable=1` gates what can be paid from/into; `account_is_bank=1` only excludes bank accounts from the deposit-account dropdown (`sales/deposit.php:78`).
- Imprest/Petty Cash: `getImprestBalance()` reads `accounts WHERE name='Imprest' OR name='Petty Cash'` (`Crud_model.php:3159-3175`); top-up is just an account transfer.

## 3. Event → postings catalogue

| # | Business event | Debit | Credit | journal value | Tables written | Evidence |
|---|---|---|---|---|---|---|
| A1 | Sales invoice (any variant) | Accounts Receivable (total) | General Sales (total) | `'Sales'` | sales_order, payment_with_goods, invoice, accounts×2, general_journal×2, invoice_code (closed), items | 6260-6293 |
| A2 | Same-day payment at checkout (per account) | account paid-to | Accounts Receivable | `'Receipts'` | payment, accounts×2, general_journal×2 | 6448-6503 |
| A3 | Overpayment at checkout | — (Accounts Payable += \|due\|) | — | — | accounts | 6440-6445 |
| A4 | Receive payment, general branch | account paid-to | Accounts Receivable | `'Receipts'` | payment, invoice (FIFO alloc), sales_order, payment_with_goods, accounts×2, general_journal×2 | 16762-17231 |
| A5 | Receive payment, specific-invoice branch | account paid-to (**total per account — defect**) | Accounts Receivable (**total per account — defect**) | `'Receipts'` | as above | 17270-17438 |
| A6 | Purchase (PO save) | General Products Purchased | Accounts Payable | `'Purchases'` | purchase_order, accounts_payable, accounts×2, general_journal×2, items, stock_manager, stock_record | 4771-4820 |
| A7 | Payment at PO time | Accounts Payable | account paid-from | `'Payments'` | payment, accounts×2, general_journal×2 | 4884-4918 |
| A8 | Payable payment (specific PO) | Accounts Payable | account paid-from | `'Payments'` | accounts_payable, purchase_order, payment, accounts×2, general_journal×2 | 14915-14966 |
| A9 | Debt payment (`de_`) | Accounts Payable | paid-from | `'Payments'` | outstanding_debts, payment, accounts×2, general_journal×2 | 14273-14305 |
| A10 | Cash-creditor payout (`ce_`) | Accounts Payable | paid-from | `'Payments'` | invoice, payment, accounts×2, general_journal×2 | 14469-14505 |
| A11 | Expense payment | allocated account | paid-from | `'Payments'` | payment (type Expense), accounts×2, general_journal×2 | 15062-15094 |
| A12 | Enter payable (manual) | allocated account | Accounts Payable | `'General'` | accounts_payable or invoice, general_journal×2 | 13555-13671 |
| A13 | Fund transfer | account_to | account_from | `'Fund Transfer'` | accounts×2, general_journal×2 (no payment row) | 2089-2110 |
| A14 | Deposit received | deposit account | **Accounts Payable** | `'Deposits Received'` | invoice (negative), accounts×2, general_journal×2 | 16504-16542 |
| A15 | Deposit consumed at invoicing | (reduces negative invoice) | — | — | invoice, sales_order, payment_with_goods, cash_deposit_disbursement | 10773-10917 |
| A16 | Negative-bal sale (credit → goods) | Accounts Receivable (+hidden_total−paid) and/or AP adjustments | General Sales (hidden_total + balance_due) | `'Sales'` | see [sales-pos-lifecycle.md](sales-pos-lifecycle.md) | 10559-10726 |
| A17 | Item transfer | **receiver (quantity!)** | **item name (quantity!)** | `'Item Transfer'` | items_transfers, general_journal×2 | 23062-23105 |
| A18 | Refund | (reversed A1/A2 in place) | | `'Receipts'` | sales_order, invoice, payment, accounts, general_journal | 9809-10396 |

**Integrity verdict:** the two-row pattern is nominally double-entry, but (a) nothing enforces balance at rest, (b) `account_balance` snapshots drift, (c) A5 multiplies money on split payments, (d) A17 posts *quantities* into money columns, (e) `update_ables` overwrites AR/AP from browser state (`Admin.php:24775-24817`).

## 4. Financial statements (as-built)

### Trial balance (`pages/reports/trial_balance_report.php`)
`SUM(debit)/SUM(credit) GROUP BY account_name` over `general_journal` between timestamps (32-92). Rows only for names still present in `accounts` (47-57). **Opening balances ignored** → movement-only TB that cannot tie to the balance sheet.

### Balance sheet (`pages/reports/balance_sheet_report.php`)
- Bank & cash: `account_type=1` minus AR; balance = **latest `general_journal.account_balance` snapshot ≤ date** (53-72).
- Inventory: last `item_balance` snapshot × `items.purchase_price` (77-127).
- **Debtors: frozen `debtors` snapshot table** (129-175) — only writer `debtorsCreditorsUpdator()` is 100% commented out (`Admin.php:1198-1468`).
- Liabilities: frozen `creditors` table + per-customer `quantity_due × price` (182-268).
- **Equity = total_assets − total_liabilities** (plug; no capital/retained earnings, line 271).
- The `balance_sheet` DB table (schema:117-128) is never referenced — dead.

### Income statement (`pages/reports/income_statement_report.php`) — **cash basis**
- Revenue = `SUM(payment.amount) payment_type='Receivable'` (47-51); other income = `payment_type='Income'` (53-58).
- **COGS = `SUM(payment.amount) payment_type='Payable'`** (62-67) — i.e. payments to suppliers incl. loans and cash-creditor payouts.
- Expenses = `payment_type='Expense'` (71-76); `gross = revenue − cogs`; `net = gross − expenses`.
- Mixed date filtering: numeric `timestamp` for revenue vs lexicographic `date` strings elsewhere → mismatched periods.

### Cash flow (`pages/reports/cash_flow_report.php`)
Opening/closing from journal snapshots; inflows = Receivable payments (deposits excluded); outflows = **all POs** (credit purchases counted as cash out, 97-121) + Payable payments **without po_code** + expenses. Hybrid cash/accrual that cannot reconcile with the closing balances shown.

### Journals (`pages/journal/*`)
Direct queries on `general_journal` filtered by `journal` value and optional account/date. `get_general_journal.php:37-39` uses `or_where('journal','Fund Transfer')` which **breaks the CI3 AND-chain** — fund transfers from any account/date leak into filtered listings.

## 5. Corrected model (target)

- Proper **double-entry engine**: journal entries as documents (header + lines), DB-enforced `SUM(debit)=SUM(credit)` per entry, FK'd accounts, posting service invoked by domain events (invoice posted, receipt posted, GRN posted, etc.) inside one DB transaction.
- Control accounts (AR/AP) kept in sync by **subledger derivation**, not incremental string arithmetic; customer/supplier balances derived from documents, with reconcilable subledger-vs-control checks.
- Effective-dated chart of accounts; account renames preserve identity (id-keyed).
- Statements on accrual basis with correct COGS (cost of goods sold from the stock ledger at sale), closing-stock valuation, and a disciplined cash-flow (direct method from receipts/payments; transfers excluded).
- Locked periods; void/reversal entries instead of edits; every financial mutation idempotent (idempotency key) and auditable.

## 6. Migration implication

Because `accounts.current_balance` and `general_journal.account_balance` are unreliable (browser overwrites, read-back races, A5 multiplication), the migration **must not** carry them as truth. Opening balances for the new system must be recomputed from subledger documents (invoice/AP/payment sums) and reconciled against the legacy trial balance — see `docs/migration/migration-reconciliation-strategy.md`.
