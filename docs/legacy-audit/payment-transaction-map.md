# Payment, Cash / Bank / MoMo Transaction Map

## 1. Payment methods model

**A payment method is a row in the `accounts` table.** There is no separate method registry. The tender UI renders one amount input per selected account (`method_amount_<account_id>`, `pages/pos/account_field_payment.php:23`), and detail fields are keyed by **account-name string matching**:

- name contains `cheque` → `bank_name_<id>`, `branch_<id>`, `cheque_number_<id>` (`account_field_payment.php:25-31`);
- name contains `momo` → `momo_phone_<id>`, `momo_transaction_id_<id>` (`:32-37`).

`payment` table carries the structured fields: `bank_name`, `branch`, `cheque_number`, `momo_phone`, `momo_transaction_id`, `momo_type ENUM('MTN','Vodafone','AirtelTigo')` (schema:620-633).

**Defects:** only the POS checkout persists cheque/MoMo detail posts (`Admin.php:6416-6420`); the main receive-payment engine `payments_received` never reads them. `momo_type` and `method` columns are **never written by any code** (dead). MoMo provider is therefore implied by which account was selected, not recorded.

## 2. Payment types (`payment.payment_type`)

| Value | Written by | Meaning |
|---|---|---|
| `'Receivable'` | POS checkout (`Admin.php:6399`), `payments_received` (16958+) | Cash received from customer |
| `'Payable'` | PO-time payment (5381/5399), supplier/debt/ce branches (14257, 14452, 14778) | Money paid out |
| `'Expense'` | expenditure branch (15048) | Operating expense |
| `'Deposit'` | `deposits_received` (16486) | Customer deposit |
| `'Income'` | **no writer** (read-only legacy type) | Other income |

`payment.category` values: `'Cash Sales'`, `'Payables'`, `'Receivables'` (16978-16993, 6349/6365). `cash_sales_in_payables` splits POS money between delivered value and prepayment when `quantity_due > 0` (6345-6392).

## 3. Receipt lifecycle

- `receipt_code = 'DP1REC-' . YmdHis` — **second resolution, no uniqueness check** (`Admin.php:6336, 16815, 17367`). Receipt views/edit/delete key solely on it; same-second receipts merge (defect D2).
- Print: `admin/receipt/<code>/<customer>/<date_time>/<printer>/<pos>` → thermal `receipt_pos.php` (printer=1) or A4 `receipt.php` (`Admin.php:24739-24764`).
- Printed "Balance Owe" = `SUM(invoice.amount_due)` for the customer **without receipt/so filter** (`receipt_pos.php:96-101`) — whole-customer balance, not this receipt's.
- "Payment Methods" block on receipts reads `accounts_used` (`receipt_pos.php:128, 270-279`) — a table **only populated by a one-time backfill** `populateAccountsUsedTable()` (`Crud_model.php:3204-3260`) whose insert uses column `account_amount` while the schema defines `amount` (schema:57) — stale/empty for all post-backfill payments.

## 4. Receive payment — `Admin::payments_received` (16734-19593)

### General branch (customer, no specific invoice)
1. `amount_tendered`, `amount_paid` (≤ tendered validated, 16801-16803); `change_due = tendered − paid` (16762).
2. Split accounts: `paymentMethodsIdsPayment` exploded+sorted (16749-16752); per account `p`: amount = `method_amount_payment_<id>` (16828).
3. **FIFO allocation across owing invoices**: `invoice WHERE customer_id AND amount_due > 0` with **no ORDER BY** (16842) → per invoice `amount_paid += x`, `amount_due -= x` until exhausted; last invoice may overpay (`receivable_for_this_invoice_code = total_amount_paid_now`, 17052). Status ladder incl. `'Over Paid'` (16884-16895).
4. Mirrors: `sales_order` + `payment_with_goods` amount/status updates (16906-16937); `track_code` **overwritten onto all prior payment rows** of the so_code (16944-16948) — destroys audit linkage.
5. Per account: `payment` row (16957-16976), AR decrement + account increment (16925-16937), Receipts journal pair (16995-17031).
6. Category: `'Cash Sales'` if the invoice was created today, else `'Receivables'` (16978-16993).

### Specific-invoice branch — **money multiplication defect (D1)**
Inside the per-account loop everything uses the **total** `amount_received` instead of the per-account share: invoice `amount_paid += total` per account (17270), AR `−= total` per account (17321-17325), paid-to `+= total` per account (17331-17334), `payment.amount = total` per account (17373), journal debit/credit = total per account (17418, 17438). With N accounts: N× total hits AR, journals and payment rows while `amount_due` is correct → guaranteed subledger/ledger divergence, later masked by `update_ables` rebasing.

### Update / delete
- Update (17793+): diff engine — `diff = new_amount − SUM(payment.amount for receipt)`; positive → re-run allocation with delta; negative → walk invoices in reverse, **delete** `payment`/`general_journal` rows and re-credit (19355-19377); account-swap blocks (17925-18016).
- Delete → `Crud::delete_payment_received` (550-700): reverses invoice/SO/PWG amounts & statuses, AR and paid-to accounts, deletes journal + payment rows.
- "No edit after a day" rule is commented out (17719-17725).

## 5. Make payment — `Admin::payments` (14132-16368)

Branches keyed on a prefixed select value:
- `de_<debt_id>` — debt/loan payment: `outstanding_debts.amount_paid += x`, Dr AP / Cr paid-from (`'Payments'`), balances (14219-14305).
- `ce_<customer_id>` — pay cash to a negative-balance customer: invoice `amount_paid += x`, `amount_due += x` (toward 0), AR flip handling, Dr AP / Cr paid-from (14384-14505).
- `su_<supplier_id>` + `po_code` — supplier payment per PO (see [purchasing-lifecycle.md](purchasing-lifecycle.md) §1.5).
- `su_` + `po_code='0'` — **general supplier payment fully commented out** (14574-14827): silent no-op, no JSON response.
- Expenditure (param2=2): Dr allocated expense account / Cr paid-from (restricted to Imprest/Petty Cash by `get_account_paid_from.php:3-12`), `payment_type='Expense'`, `expenditure_item` (15028-15094). Edit path hardcodes `'General Office Expenses'` as the historical matcher (16307) — mis-targets other expense accounts.

## 6. Deposits — `Admin::deposits_received` (16368-16734)

- Stored as an `invoice` row with `invoice_code = so_code = 'Deposit-'.date('His')` and `amount = amount_due = -amount_received` (**negative receivable = customer credit**), 16384-16394.
- Journal: Dr deposit account / Cr **Accounts Payable** (`'Deposits Received'`, 16504-16542) — deposits modelled as liability, not deferred revenue.
- Allocation at invoicing: the negative-bal engine consumes `'Opening-balance'` then other negative invoices, writing `cash_deposit_disbursement(so_code, invoice_code, deposit_code, amount)` rows (10773-10917); update path walks disbursements in reverse to restore credit (11644-11756).
- Defects: no delete branch; update runs account/journal writes **outside** the validation `else` (16622-16725 — posts even when validation failed); mismatched existence check tests `'Deposit-His'` but updates `'Opening-balance'` (16430-16450).

## 7. Banking

- Overview `admin/banking` (626-647): cards per `account_is_transferrable=1` account; balance-color thresholds hardcoded; Imprest/Petty Cash TOPUP button opens transfer modal.
- Transfer `accounts_transfer('create')` (2006-2117): validations (same-account; funds; broken `!is_numeric($amount) && $amount < 1` accepts negative numerics, 2042) then Dr-to/Cr-from `'Fund Transfer'` journals; **no payment row** → invisible to cash-received/expense reports.
- Enquiry `get_bank_enqueries` (24317-24322) → `get_bank_enquery_print.php`: per-account journal listing with running `account_balance` snapshots; print links target non-existent `bank_enquery_print` method.
- There is **no reconciliation** concept: no statement import, no matching; balance "verification" is the snapshot column only.

## 8. Cash received / daily reports

- `get_cash_received_list` (24502-24531; `Crud_model.php:2604-2732`): `DISTINCT receipt_code` from `payment` (types Receivable/Income), sums per receipt, concatenates account names.
- Daily variant groups by exact `timestamp` second (`Ajaxdataload_model.php:164-186`) — useless as a day filter.
- `expenses_report` (928-940): Payable + Expense payments by numeric timestamp (same COGS conflation).

## 9. Business rules to preserve

- Split/multi-tender payments across arbitrary accounts (cash + MoMo + cheque in one receipt).
- Change due vs amount received; amount_tendered ≥ amount_paid.
- FIFO allocation of receipts to oldest invoices; part-payment; overpayment → credit (negative amount_due).
- Deposits as customer credit consumed by later invoices (waterfall: opening-balance credit first).
- Payment to negative-balance customers (`ce_` flow) — refunding prepaid credit in cash.
- Cashier day categories: `Cash Sales` vs `Receivables` split for reporting.

## 10. Corrected model (target)

- `payment` header (method breakdown as `payment_tenders` rows) + `payment_allocations` (explicit invoice assignment) — no implicit FIFO at read time.
- Method registry with typed details (cheque fields, MoMo provider/reference) decoupled from account names; provider adapters behind interfaces.
- Atomic, idempotent posting; reversal documents instead of deletes; unique receipt numbers from a sequence.
- Deposits as unapplied-cash/credit documents with explicit allocation records; refunds as separate documents referencing the original payment.
- Bank/MoMo statement import + matching (reconciliation) as a first-class workflow feeding the AI matching assistant (`docs/architecture/ai-opportunity-map.md`).
