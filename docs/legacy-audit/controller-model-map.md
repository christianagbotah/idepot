# Controller → Model → View → Table Cross-Reference Map

Routing is CodeIgniter convention: `/{controller}/{method}/{params}`. Default controller `login`. The principal surface is `/admin/<method>` (165 methods). `Modal::popup*` serves modal views. This map covers every business-relevant method; trivial loaders are grouped.

## 1. Controllers

| Controller | Lines | Role | Verdict |
|---|---|---|---|
| `Admin.php` | 26,024 | The application (165 methods) | Active — to be decomposed |
| `Login.php` | 340 | Auth + first-login stock seeding | Active |
| `Modal.php` | 451 | Modal view server (20 popup families) | Active (unauthenticated — defect E1) |
| `Home.php` | 153 | School frontend CMS | Dead school remnant |
| `Install.php` | 265 | Installer | Dormant (routes default = login) |
| `Updater.php` | 104 | Zip update + script execution | Live RCE risk |
| `Mobile.php` | 939 | School mobile API | Dead school remnant + security liability |
| `Multilanguage.php` | 54 | Session language switcher | Near-dead |
| `Admin_optimized.php` | 395 | "Paste-me-in" patch fragments | Dead artifact |
| `Admin_clock_optimized.php` | 382 | Clock dispatcher copy | Dead artifact |

## 2. `Admin.php` functional map (method → model calls → view(s) → tables written)

### Shells & navigation
| Method | View | Tables (read) |
|---|---|---|
| `index`/`dashboard` (62,554) | dashboard.php | settings, aggregates |
| `sales|purchases|banking|reports` (578-672) | shells | — |
| `search_results` (78) | search_result.php | payment_with_goods, items, invoice |
| `loadContents` (535) | (AJAX nav+page) | any page — **unauthenticated** |

### Admin/attendance/settings
| Method | Model | View | Tables |
|---|---|---|---|
| `admins` create/update/delete/block/unblock (180-362) | Sms_model, email | modal_admin_add/edit, admin_list | admin, settings |
| `get_admin` (369) | — | JSON | admin |
| `get_attendance` (468) | — | JSON | attendance ⋈ admin |
| `manage_profile` (112) | — | manage_profile.php | admin |
| `system_settings` (1689-2003) | — | system_settings.php | settings, accounts, account_type |
| `sms_settings` (1631) | — | sms_settings.php | settings |
| `clock_in`/`clock_out` (private, 24909/24943) | — | — | attendance, stock_manager, items |
| `cronJobForClockingInClockingOut` (24975) | — | — | attendance, stock_manager |
| `check_session` (25177) | — | — | admin |
| `get_parents` (25191) | Ajaxdataload | JSON | parent (school — dead) |

### Sales & POS
| Method | Model | View | Tables written |
|---|---|---|---|
| `pos` (24822) | — | pos/pos_page.php | — |
| `get_pos_main_page` (25275) | — | pos/get_main_page.php | (triggers `update_ables`) |
| `getCodesForNewOrder`/`getPOCodeForNewOrder` (25283/25279) | Ajaxdataload::getSOCodeForNewOrder/getPOCodeForNewOrder | JSON | — |
| `confirm_item_selection` (24832) | — | pos/get_confirm_item.php | — |
| `item_unit_selection_pos` (24891) | Crud::getAvailableUnits | pos/get_item_unit_list.php | — |
| `add_order_row_pos` (23697) | — | add_order_row_pos.php | — |
| `add_order_row_pos_unit` (23722) | — | add_order_row_pos_unit(.php/_fixed_quantity) | — |
| `order_item_selected` (23866) | — | JSON (price) | — (reads items_prices, items_units_prices, units_items, items) |
| `sales_order_pos` create/update/delete (5760-7738) | Crud::delete_invoice/delete_sales_order | get_main_page.php, edit_sales_order.php | **sales_order, payment_with_goods, invoice, invoice_code, items, items_prices, items_in_units_order, unit_transfer, accounts, general_journal, payment, customers** |
| `sales_order_pos_alterated` (7743-9807) | — | none | (dead fork; same tables) |
| `payment_with_goods` (12291-13553) | Crud::getItemUnitQuantity etc. | pos|sales/payment_with_goods.php, get_unpicked_order.php, get_payment_with_goods_order.php | sales_order, payment_with_goods, waybill_code, items, unit_transfer, items_in_units_order, invoice, general_journal, payment, accounts |
| `sales_order_negative_bal` (10399-12287) | — | add/edit_sales_order_negative_bal.php | sales_order, payment_with_goods, invoice, cash_deposit_disbursement, items, accounts, general_journal, payment |
| `create_proforma_invoice` (5610-5756) | — | create_proforma_invoice.php | proforma_invoice_order, proforma_invoice |
| `sales_order_refund` (9809-10396) | — | refund_sales_order.php | sales_order, payment_with_goods, items, invoice, payment, general_journal, accounts (**broken — non-existent columns**) |
| `receipt` (24739) | — | receipt.php / receipt_pos.php | — (reads payment, accounts_used, invoice, customers, settings) |
| `invoice_print` (674) / `proforma_invoice_print` (693) | — | invoice_print.php / proforma_invoice_print.php | — (reads sales_order, customers, settings) |
| `customer_statement` (711) | — | sales/customer_statement.php | — (reads general_journal, payment_with_goods, customers, invoice) |
| `is_creditor` (24080) | — | JSON | — (reads sales_order, invoice) |

### Payments / banking
| Method | Model | View | Tables written |
|---|---|---|---|
| `payments_received` (16734-19593) | Crud::delete_payment_received | pos|sales/payments.php, edit_payments.php | invoice, sales_order, payment_with_goods, payment, general_journal, accounts |
| `payments_received_backup` (19598-22798) | — | none | dead |
| `payments` (14132-16368) | Crud::delete_purchase_payment | purchases/payments.php, edit_payments.php, payments_history.php | accounts_payable, purchase_order, outstanding_debts, invoice, payment, general_journal, accounts |
| `deposits_received` (16368-16734) | — | sales/deposit.php, edit_deposit.php | invoice, cash_deposit_disbursement(on alloc), payment, general_journal, accounts |
| `enter_payable` (13554-14132) | — | purchases/enter_payable.php, edit_enter_payable.php | accounts_payable, invoice, outstanding_debts, general_journal, accounts |
| `accounts_transfer` (2006-2117) | — | banking/account_transfer.php | accounts, general_journal |
| `banking` (626) / `get_bank_enqueries` (24317) | — | banking.php / get_bank_enquery_print.php | — |
| `get_bank_balance` (24066), `getImprestBalance` (25792) | Crud::getImprestBalance | JSON | — |
| `get_account_field`/`get_account_field_payment` (25799/25821) | — | pos/account_field*.php | — |
| `account_allocation` (24137) | — | JSON | — |
| `update_ables` (24775) | — | JSON | **accounts, general_journal** (browser-driven overwrite) |

### Items / inventory / transfers / pricing
| Method | Model | View | Tables written |
|---|---|---|---|
| `item` (4075-4396) | Crud::delete_item | sales|pos/add_item.php, edit_item.php, view_items.php | items, stock_manager, units_items, items_units_prices, items_prices |
| `item_category` (4399-4585) | — | add/edit_item_category.php, view_items_category.php | item_category, item_main_category |
| `purchase_order` (4588-5594) | Crud::delete_purchase_order | purchases/add_/edit_purchase_order.php, preview_order.php | purchase_order, items, stock_manager, stock_record, accounts_payable, accounts, general_journal, payment |
| `items_transfer` (22942-23404) | Crud::delete_items_transfers | items_transfers/* | items_transfers, items, general_journal |
| `add_item_transfer_row` (23834) / `transfer_item_selected` (23856) | — | add_/edit_item_transfer_row.php | — |
| `get_item_transfer_list` (23686) | — | get_item_transfer.php | — |
| `pricing` (22799-22939) | — | sales/pricing.php, get_price_list.php | items_prices, items_units_prices |
| `manage_prices` (24766), `get_price_list` (23410), `get_items_list` (25293), `addItemToPriceList` (25300) | — | pricing views | items_prices |
| `addItemUnits` (25310) / `getItemUnitsByItemId` (25427) | — | get_available_units_ids.php, get_added_units_list_for_item.php | units_items, items |
| `batchPriceInsert/Update` (25872/25927), `updateUnitQuantity` (25958), `updateZeroBalanceItems` (25835), `populateAccountsUsedTable` (25995) | Crud equivalents | — | items_prices, items, payment_with_goods, items_transfers, accounts_used — all unreferenced maintenance endpoints |
| `loadItemHistory*` (25459-25486) | — | sales/item_history.php etc. | — |

### Customers / suppliers
| Method | View | Tables written |
|---|---|---|
| `customer` (2426-4059) | add_/edit_customer.php, add_/edit_debtor|creditor_opening_balance.php | customers, invoice, sales_order, payment_with_goods, accounts, general_journal |
| `supplier` (2120-2423) | add_/edit_supplier.php | suppliers, accounts_payable, accounts, general_journal |
| `get_debtor/creditor_opening_balance_order` (24622/24641) | order-row views | — |
| `getAllCreditors` (25490) / `getPaymentAccount` (25495) | purchases/get_creditors_list.php / get_account_paid_from.php | — |
| `get_payable` family (23429-23578), `get_invoice_balance` (24658), `get_negative_balance` (24670), `get_payment_with_goods_order*` (24697-24734) | JSON fragments | — |

### Lists / AJAX feeds
`get_sales_order_list` (24280→Crud), `get_invoice_list` (24302→Crud), `get_purchase_order_list` (24270→Ajax), `get_accounts_payable_list` (24362), `get_payables_taken_list` (24398), `get_credit_purchases_list` (24420), `get_accounts_receivable_list` (24442), `get_receipt_list` (24472), `get_cash_received_list` (24502→Crud), `get_daily_cash_received_list` (24533), `get_expenses_list` (24539), `get_deposit_list` (24551), `get_all_journal` (24325), `get_all_invoice_items` (25448), `get_customers` (25454), `get_item_history*` — each renders a list fragment view; sources documented in [table-business-map.md](table-business-map.md).

### Reports
`stock_margin_report` (777), `inventory_report` (746), `all_items_report` (762), `trial_balance_report` (881), `cash_received_report` (897), `daily_cash_received_report` (912), `expenses_report` (928), `purchase_order_report` (943), `item_transfer_report` (960), `sales_order_report` (977), `sales_order_summary_report` (1006), `sales_order_daily_summary_report` (1030), `getDailySalesOrderReport` (1053), `invoice_report` (1077), `daily_stock_report` (1107), `backlog_report` (1145), `balance_sheet_report` (1184), `accounts_payable_report` (1471), `creditors_report` (1505), `payables_taken_report` (1532), `credit_purchases_report` (1559), `accounts_receivable_report` (1584), `income_statement_report` (1603), `cash_flow_report` (1617), `getStockMargin{Daily,Weekly,Monthly}Report` (25762-25790) — each loads its reports/ view; data logic largely **inside the views** (see [reports-kpi-inventory.md](reports-kpi-inventory.md)).

### Code registries
`generateInvoiceCodes` (25501), `generateWaybillCodes` (25589), `invoiceReasonUpdator` (25675), `waybillReasonUpdator` (25711), `getInvoiceCodeSection4Verification` (25747), `getWaybillCodeSection4Verification` (25752), `get_generated_{po_no,so_no,invoice_code,waybill_code}` (24074-24124 → Crud::verify_*), `get_payables_order_so_codes` — write/read `invoice_code` / `waybill_code`.

### Utilities
`filter_values` (24159), `get_selected_dates` (24178), `can_edit_order` (24566), `isOpeningPo` (25270), `is_creditor` (24080), `mark_welcome_shown` (26014), `backups_creditors` (26002), `delete_creditors` (26008 → Crud), `get_orders_by_customer/so_code` (24125/24130), `get_supplier/customer_address` (23418/23638), `get_po_codes`/`get_inv_codes` (23580/23604), `itemSoldInUnit` (24857), `debtor_order_item_selected` (24052), `add_order_row`/`add_proforma_invoice_row`/`debtor_add_order_row`/`add_creditor_order_row`/`add_order_row_negative_bal` (23646-23833).

## 3. Models

| Model | Methods (business) | Called by |
|---|---|---|
| `Crud_model` (3,379) | verify_so/po/invoice/waybill_no (1140-1214); getGeneratedInvoice/WaybillCode (3126-3157); delete_supplier (20-102); delete_customer (105-225); delete_item (228-249); delete_purchase_order (295-423); delete_purchase_payment (426-547); delete_payment_received (550-700); delete_invoice (703-735); delete_sales_order (738-1106); delete_items_transfers (1109-1137); isOpeningPo (276-292); getItemUnitQuantity/getUnitItemBalance (2910-2943); get_sales_order_list (2182-2450); get_invoice_list (2464+); get_cash_received_list (2604-2732); get_daily_cash_received_list (2735+); getImprestBalance (3159); account getters (3177-3201); populateAccountsUsedTable (3204-3260); get_backups_creditors/delete_creditors (3263-3375); auth_verification (1914-1950) + dead school blocks | Admin, Login, Modal |
| `Ajaxdataload_model` (1,939) | getSOCodeForNewOrder (1802-1846); getPOCodeForNewOrder (1894-1938); all_sales_orders/all_invoices/all_cash_received/all_daily_cash_received (53-186); + dead school feeds (212-1800) | Admin |
| `Sms_model` (177) | send_sms (Hubtel cURL, creds from settings) | Admin::admins |
| `Barcode_model` (73) | create_barcode (Code39 PNG) — never called | — |
| `Setting_model` (144) | school schema getters — dead | loaded but unused |
| `Stripe_model`/`Paypal_model`/`Frontend_model`/`get_sales_order_list_extracted` | dead | — |

## 4. Helpers

| Helper | Live functions |
|---|---|
| `user_validation_helper.php` (981) | append_words; email/phone validation; *_validation_insert/update checkers; validate_so/po_no; invoice/waybillDuplicateChecker; date utilities (getStartAndEndDate, date_format_converter, get_selected_dates-like logic) — plus dead school validators |
| `manager_helper.php` (222) | userHasClockedInToday; customerAlreadyPickedPayablesTodayQuery; clock_in_out dispatcher (unroutable) |
| `receipt_helper.php` (115) | print_in_thermal — dead demo |
| `multi_language_helper.php` (26) | get_phrase (ucwords hack) |
