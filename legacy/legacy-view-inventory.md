# Legacy View Inventory

The uploaded legacy application mixes the real depot/POS application with leftover school-management files from the starter project.

## Strongly relevant/current iDepot view areas

The current business UI is primarily under `_al01i/v_l02i/backend/admin/pages/` and `_al01i/v_l02i/backend/admin/navs/`. The uploaded archive contains **266 nested PHP business page files** in that page tree. These cover:

- Dashboard and operational shortcuts
- Sales orders and POS
- Invoices, receipts, deposits and customer payments
- Proforma invoices
- Customers, customer statements and accounts receivable
- Products/items, main/sub categories, pricing and customer-specific prices
- Package/unit sales and unit conversions
- Item/stock transfers
- Daily stock, backlog and item history
- Purchases and purchase orders
- Suppliers, accounts payable and supplier payments
- Banking, account enquiries and transfers
- General/payment/sales/purchase/receipt journals
- Balance sheet, income statement, cash flow and trial balance
- AR/AP, inventory, stock-margin, sales, invoice, purchase and transfer reports
- POS/opening/closing stock screens
- Admin/profile/system settings used by the depot application

The navigation files found for active modules are `dashboard-nav.php`, `sales-nav.php`, `purchases-nav.php`, `banking-nav.php` and `reports-nav.php`.

## Key active business subtrees to inspect view-by-view

- `pages/pos/`
- `pages/sales/`
- `pages/purchases/`
- `pages/banking/`
- `pages/reports/`
- `pages/journal/`
- `pages/items_transfers/`
- `pages/dates_selection/`

Also inspect active page files directly under `pages/`, including dashboard, payments, admin/user, attendance/shift, payables and settings pages.

## Legacy controller/model evidence

The principal legacy controller is `_al01i/controllers/Admin.php` (about 1.2 MB), with major functions for dashboard, sales, purchases, banking, reports, customer statements, stock/margin reports, purchase reports, sales reports, invoice reports, accounts payable/receivable, account transfers, suppliers, customers, items, categories, purchase orders, POS sales, refunds, payments, item transfers, unit sales and invoice/waybill reason handling.

Models include `Crud_model.php`, `Ajaxdataload_model.php`, `Barcode_model.php`, `Sms_model.php` and related integration models. The legacy code uses a very large controller and duplicated calculations, so the new system must extract domain rules into tested services rather than mechanically porting controller methods.

## Clearly unrelated school-management leftovers

The original top-level `_al01i/v_l02i/backend/admin/*.php` directory contains **223 legacy views**, with at least **110 filenames clearly matching school-domain concepts**. Treat files matching these concepts as unrelated unless an active depot route proves otherwise:

- student/students/student profile/student promotion/student marksheet
- teacher
- class/class routine/section
- exam/online exam/question paper
- marks/raw score/tabulation/grade
- subject
- parent
- librarian/book/study material
- dormitory
- academic syllabus
- creche
- feeding/class school fees
- school transport
- student IDs and bulk admission

Do not rebuild school modules just because those files exist.

## Classification rule for z.ai

For every legacy view, controller method, model method and table encountered, create a register with: path/name, active/dead/duplicate, iDepot relevance, route/caller, tables read/written, calculation/side effects, defects discovered, and the replacement module in the new architecture. Uncertain files must remain “uncertain” until traced; do not assume either relevance or irrelevance without evidence.
