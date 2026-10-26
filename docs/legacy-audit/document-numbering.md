# Invoice, Receipt, Waybill and Document-Numbering Rules

## 1. Document families and code sources

| Document | Code column(s) | Generation | Uniqueness |
|---|---|---|---|
| Sales order | `sales_order.so_code` (+ mirror `payment_with_goods.so_code`) | **Client-side** string surgery on the largest existing code (`pages/pos/get_main_page.php:100-166`; server twin `Ajax::getSOCodeForNewOrder`, `Ajaxdataload_model.php:1802-1846`) | format gate `validate_so_no` (`user_validation_helper.php:521-535`); insert gate `s_order_validation_insert` (:318-341); **no DB unique index** |
| Purchase order | `purchase_order.po_code` | `Ajax::getPOCodeForNewOrder` (1894-1938) — finds the "second numeric character" of the max code and increments | `p_order_validation_insert` (:292-315); `Crud::verify_po_no` (1140-1159); no unique index |
| Invoice | `invoice.invoice_code` | **Pre-printed booklet table** `invoice_code` — first `status='open'` row by id (`Crud::getGeneratedInvoiceCode`, `Crud_model.php:3126-3134`) | `verify_invoice_code` (1185-1197) "VALID" only if equal to the next open code; insert gate `invoice_code_validation_insert` (uvh:345-368 — contains the `$ounter`/`$counter` typo) |
| Waybill | `payment_with_goods.waybill_code` | Booklet table `waybill_code`; **same-day reuse per customer** when the customer already picked payables today and `useSameWaybillCode=='yes'` (`Crud::getGeneratedWaybillCode`, 3136-3157; `manager_helper.php:62-77`) | `verify_waybill_code` (1200-1214); `waybillDuplicateChecker` (uvh:958-977) |
| Receipt | `payment.receipt_code` | `'DP1REC-' . YmdHis` — second-resolution timestamp (`Admin.php:6336, 10926, 16815`) | **none** — collisions merge receipts |
| Transaction group | `track_code` on sales_order/payment_with_goods/invoice/payment/general_journal | `substr(sha1(md5(mt_rand(1034200000, strtotime(now)))), 0, 15)` — duplicated verbatim at 8 sites (5618, 5768, 7751, 10407, 10963, 12291+, 12306, 16813) | none |
| Proforma | `proforma_invoice.invoice_code` / `so_code` | inherits the SO code of the proforma basket | none |
| Deposit | `invoice.invoice_code = so_code = 'Deposit-'.date('His')` | (`Admin.php:16384-16393`) | none (second-resolution) |
| Manual payable | `accounts_payable.po_code = 'LPAY-'.substr(strtotime('now'),5)` | (`Admin.php:13582`) | none |
| Transfer group | `items_transfers.token_no = 'TR'+substr(sha1(md5(mt_rand(...))),0,18)` | (`add_item_transfer.php:2`) | none |
| Opening documents | literal prefixes `'Opening-balance'` (customer cash OB, supplier OB), `'Opening-or…'` (opening POs), `'Opening-<prefix>…'` (opening SOs) | (`Admin.php:2976-2983`, 2202-2212; `Crud_model.php:741-746`) | special-cased everywhere |

Prefixes/next-number settings come from the `settings` table: `so_prefix`, `so_no`, `po_prefix`, `po_no`, `pm_prefix`, `pm_no`, `p_prefix`, `p_no`, `s_prefix`, `s_no` (`Admin.php:1710-1800`); `inv_prefix`/`inv_no` are commented out — invoice numbering is booklet-driven instead.

## 2. Booklet lifecycle (`invoice_code` / `waybill_code`)

- **Creation**: ranges generated in System Settings (`admin/generateInvoiceCodes/<start>/<end>`, `Admin.php:25501-25585`; waybills 25589-25672) with range + per-code duplicate checks, `insert_batch` of `status='open'` rows, `created_by`, `code_range`.
- **Allocation**: the POS shows the next open code with a verification widget (`getInvoiceCodeSection4Verification` / `getWaybillCodeSection4Verification`, 25747-25758).
- **Closure**: on sale completion the row → `status='closed'`, `customer_id` stamped (6530-6533); waybill at picking (13180-13183).
- **Spoilage**: `admin/invoiceReasonUpdator/<code>` / `waybillReasonUpdator` (25675-25743) mark `'not used'` with a mandatory reason ≥ 10 chars, from the verification widgets.
- **Concurrency defect**: read-then-use with no locking — two cashiers validating concurrently both pass `verify_*` before either closes the row (`Crud_model.php:3126-3157` vs closure at sale end).

## 3. Special numbering behaviours to preserve

- **`R` suffix reversal codes**: negative-bal (cash-creditor) orders append `'R'` to the reused so_code/invoice_code (`add_sales_order_negative_bal.php:20-70`); the SO generator excludes `R`-suffixed codes (`not_like('R','before')`); payables-taken reports special-case them as reversals (`get_payables_taken_list.php:104-111`).
- **Same-customer same-day waybill reuse** — deliberate: one waybill covers all of a customer's picks that day (`useSameWaybillCode` toggle, `get_waybill_for_verification.php`).
- **Invoice code must be verified before submit** — the POS re-verifies immediately before POST (`get_main_page.php:1149-1154, 1323-1346`).
- Invoice codes are **pre-printed physical booklet numbers** — this is why the booklet table exists; the new system must preserve imported codes and continue client-specific ranges/sequences per branch.

## 4. Print artefacts

- Invoice: `admin/invoice_print/<customer>/<so>/<invoice>` → `pages/sales/invoice_print.php` (reads `sales_order` rows; prints `Σ line.amount` as total — inconsistent with discounted `grand_total`, see [defects-and-risks.md](defects-and-risks.md) R9).
- Proforma print: `admin/proforma_invoice_print` (693-708).
- Receipt: thermal/A4 split (`Admin.php:24739-24764`); printer selection UI `pages/sales/printer_selection.php`.
- ESC/POS helper `receipt_helper.php` is a hardcoded "ExampleMart" demo, never called (helpers/receipt_helper.php:16-86).

## 5. Corrected model (target)

- Collision-safe, tenant/branch-aware sequences: `document_sequence` registry (doc type + branch + period) with atomic `SELECT … FOR UPDATE` / dedicated counter table; formats like `{prefix}{branch}{period}{seq}` configurable, **booklet import supported** for clients with pre-printed stock (allocate exactly like the booklet table, with locking).
- Preserve all legacy codes verbatim during migration (unique-constrained with legacy namespace).
- `receipt_code`, `track_code` equivalents generated server-side (UUIDv7/ULID for internal linkage + human codes for print).
- Waybill remains a delivery document with explicit reuse policy per customer/day, enforced server-side.
- Every code state transition (open → allocated → closed / not-used+reason) audited; the "not used + reason" booklet behaviour is preserved as a first-class spoilage workflow.
