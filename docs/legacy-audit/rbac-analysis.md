# User / Role / Permission Analysis (As-Built)

## 1. Identity model

- Single user table `admin` (schema:71-89): `name, phone, designation, email, password (bcrypt), level (longtext), manager enum, authentication_key (5 chars), block_limit, active_status (never read), online_status, welcome_shown_date (written, never read)`.
- **Two-phase login**: 5-char `authentication_key` (AJAX pre-check `Login.php:67` → `Crud_model.php:1914-1950`) then email+password (`Login.php:99-186`), key compared with `==` (non-constant-time).
- Passwords: `password_hash(PASSWORD_BCRYPT)` on web paths (`Login.php:148,304`; `Admin.php:148,193`) ✔. Mobile API uses `sha1()` and can overwrite web hashes (dead code but live risk).
- Blocking: `block_limit == 3` blocks; set by admins, by self-service **unauthenticated** `login/block_account` (DoS), cleared by unblock. No failed-attempt counting, no rate limiting, no captcha, no lockout policy.
- No MFA, no device/session management beyond `ci_sessions`; `online_status` flipped by login/logout/check_session (the latter unauthenticated).
- Password reset: 7 chars from `md5(rand())` emailed (`Login.php:285-318`). Credentials (plaintext password + auth key) SMSed/emailed on user creation (`Admin.php:236-243`).

## 2. Levels and their effective power

| level | Meaning | Server-enforced powers |
|---|---|---|
| 1 | Super Administrator | same as 2 + can back-date payments (`Admin.php:14154-14164`) and edit day-old orders (`6902-6907`) |
| 2 | Administrator | everything else (all mutations — no per-level gates) |
| 3 | Cashier | **only** blocked from 5 shell pages (dashboard/sales/purchases/banking/reports, `Admin.php:559-659`) and redirected to POS; still can: create superadmins, delete admins, edit chart of accounts, run every mutation endpoint |
| 4 | Shop Attendant | appears only in add/edit user forms (`modal_admin_add.php:64-67`) and one dead check on a never-set session var (`Admin.php:13556`) |

`manager` flag (enum): gates exactly two menu items — Daily Cash Received, Daily Stock Report (`sales-nav.php:88-92,141-145`).

## 3. Authorization gaps (summary; full list in [defects-and-risks.md](defects-and-risks.md) §E)

- 63 `admin_login` checks across 165 `Admin.php` methods → **~70 endpoints unauthenticated**, including financial writes and all report reads.
- All `Modal::popup*` (20 families) unauthenticated → any modal view (payments, customers, reports pickers) renderable anonymously.
- No level checks on: `admins()` (user management), `system_settings()` (chart of accounts!), `sms_settings()` (secrets), supplier/customer/item/purchase/sales mutation endpoints.
- View-only gates (top-bar menu visibility) are the only RBAC surface for several functions.

## 4. The dead RBAC schema

`roles` (4 seeded), `permissions` (17 seeded), `role_permissions` — modern DDL with FKs, **zero code references**. Evidence of an abandoned RBAC introduction. The new system implements this design properly (see `docs/architecture/security-rbac.md`).

## 5. Menu structure (what users actually see)

Top tabs: **Dashboard | POS | Sales | Purchases | Banking | Reports** (AJAX-loaded sidebars via `admin/loadContents`).

- **dashboard-nav**: Transactions (make/receive payment, view journal) · Sales (new SO, apply payment) · Purchases (new PO, enter AP) · Banking (enquiry, transfer) · Settings.
- **sales-nav**: General Sales · Sales Order (create/view) · Invoices (view) · Receipts (receive payment, cash received, receipts, *manager*: daily cash) · Invoice Items (main/sub categories, add item, backlog, view items, transfers, *manager*: daily stock) · Customers (add/view) · Settings.
- **purchases-nav**: General Purchases · POs (create/view) · AP (record/view) · Payables Taken · Make Direct Payments · Suppliers (add/view) · Settings.
- **banking-nav**: Banking · enquiries/transfer · Settings.
- **reports-nav**: BS, IS, CF, TB, AR, AP, **AP Test** (debug), invoice, inventory, stock margin · Settings.
- Top-bar user menu: profile; level 1/2: add user / users list / attendance list / settings; logout. Hardcoded customer webmail link (`top-header.php:50`).

## 6. Target RBAC (design summary — details in `docs/architecture/security-rbac.md`)

- Granular permissions (sales.view/create/discount/void/approve; payment.receive/refund/allocate/void; inventory.adjust/transfer/approve; purchase.create/approve/receive/pay; banking.view/reconcile/transfer; accounting.post/reverse/close_period; reports.financial.view/export; users.manage; settings.manage; ai.insights.view…) composed into tenant-defined roles; seeded roles per master prompt §11 (Platform Super Admin, Owner, Branch Manager, Sales Manager, Cashier, Attendant, Inventory Officer, Procurement Officer, Accountant, Sales Rep, Dispatch Officer, Auditor, Support).
- Scopes: tenant → branch/depot → shop/warehouse → assigned salesperson; enforced server-side on every operation.
- Supervisor override with PIN re-authentication for sensitive POS actions (void, discount beyond limit, refund, reprint, price override) retaining full user identity in audit.
- MFA for privileged roles; Argon2id; device/session management and revocation.
