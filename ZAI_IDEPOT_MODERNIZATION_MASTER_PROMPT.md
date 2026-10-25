# z.ai Master Prompt — iDepot Next-Generation Rebuild

You are the principal software architect, product engineer, database engineer, UX engineer, security engineer, migration engineer, and AI engineer responsible for rebuilding **iDepot**, a production depot/POS/inventory/accounting application used by real businesses in Ghana.

This is **not** a cosmetic frontend redesign. It is a controlled modernization and re-engineering of a legacy CodeIgniter/PHP/MySQL system into a modern, maintainable, offline-first, multi-platform product while preserving the real business rules that existing clients depend on.

## 1. Repository and source-of-truth inputs

Work in the GitHub repository `christianagbotah/idepot`.

The repository contains or will contain these legacy reference artifacts:

- `legacy/source/` — curated, sanitized legacy application source copied from the deployed iDepot VPS. It keeps the active depot/business controllers, models, business views, navigation, helpers, libraries and key layout files while excluding secret-bearing production config, uploads, dependency noise and the old top-level school-management view collection.
- `legacy/schema/legacy_mysql_schema.sql` — schema-only MySQL reference extracted from the deployed legacy SQL dump. It intentionally contains no client data rows. Some obsolete school-management tables may remain and must be classified by active code usage.
- `legacy/SECURITY-NOTE.md` — explains why the legacy reference must never be deployed directly.
- `legacy/legacy-view-inventory.md` — inventory of active nested depot views and obvious school-management leftovers found in the original starter system.

Treat the legacy source and schema as **reverse-engineering evidence**, not as a design to copy blindly.

## 2. Critical legacy-context rule: distinguish depot views from school leftovers

The old application was built from a school-management starter application. Therefore, many old files are unrelated to iDepot. Do not rebuild a school system and do not infer iDepot requirements merely because a file exists.

The current depot/business user interface is primarily under:

- `_al01i/v_l02i/backend/admin/pages/`
- `_al01i/v_l02i/backend/admin/navs/`

The old top-level `_al01i/v_l02i/backend/admin/*.php` folder contains many school-domain remnants such as students, teachers, classes, exams, marks, subjects, librarians, parents, dormitories, academic syllabus, creche, grades, transport and school fee screens. Ignore these unless an active depot route/controller/database dependency proves that a specific concept was deliberately reused for iDepot.

Before implementation, inspect the legacy project **view by view, controller by controller, model by model, and table by table**. Build a classification register with:

- file/view/route name;
- relevant to iDepot: yes/no/uncertain;
- active/dead/duplicate/backup;
- business capability represented;
- controller/function that calls it;
- database tables touched;
- business formulas or side effects found;
- defects/risks discovered;
- replacement module/screen in the new system.

Do not delete or ignore an uncertain legacy behavior until you can explain why it is obsolete, duplicated, erroneous, or school-specific.

## 3. Primary objective

Build a professional **iDepot Next Generation** platform for Ghanaian depots, distributors, wholesalers, retailers, building-material businesses and similar stock-driven businesses. It must support existing workflows while substantially improving correctness, auditability, performance, UX, security, automation, offline capability, hardware support, reporting and AI assistance.

The finished product must support:

- web portal;
- native Windows desktop application;
- native macOS desktop application;
- Android application;
- iOS application;
- installation on POS terminals/computers;
- barcode/QR scanners;
- receipt printers and label printers where applicable;
- cash drawers through supported POS printer/drawer interfaces;
- optional customer displays and other supported POS peripherals through a hardware abstraction layer;
- reliable offline operation and later synchronization.

## 4. Architecture: preferred direction

Use a modern monorepo and keep the business domain shared and testable. Prefer a **modular monolith for the core server** plus a separate Python AI service instead of premature microservices.

Recommended structure:

```text
apps/
  web/              Next.js web portal / PWA
  api/              NestJS core API and application services
  desktop/          Tauri 2 desktop shell + shared React UI + Rust hardware bridge
  mobile/           React Native / Expo iOS + Android app
services/
  ai/               Python FastAPI AI/ML service
packages/
  domain/           framework-independent TypeScript domain rules/invariants
  contracts/        shared API/event schemas
  ui/               shared design system where practical
  auth/             shared authorization helpers/contracts
  sync/             offline sync protocol, outbox/inbox and conflict policies
  config/           lint, TypeScript, formatting and shared configuration
  testing/          factories, fixtures, test utilities
infra/
  docker/
  migrations/
  monitoring/
docs/
  legacy-audit/
  architecture/
  migration/
```

Use:

- **Next.js + TypeScript** for the web portal;
- **NestJS + TypeScript** for the main backend API;
- **PostgreSQL** as the authoritative server database;
- **Python + FastAPI** for forecasting, anomaly detection, OCR/document intelligence, natural-language analytics and other AI workloads;
- **Tauri 2 + Rust** for Windows/macOS desktop packaging and safe local POS hardware access;
- **React Native / Expo** for genuine iOS/Android clients;
- **SQLite** as the durable offline database on desktop/mobile;
- IndexedDB/local persistence for web/PWA offline queues where sensible;
- PostgreSQL extensions such as `pgvector` only where AI retrieval/embeddings genuinely need them;
- Redis/background queues only where justified by asynchronous jobs, not as a mandatory dependency for simple CRUD.

Choose mature, actively maintained libraries. Pin versions, document why they were chosen, and do not couple core financial rules to a UI framework or ORM.

## 5. Database redesign principles

The legacy schema reveals valuable business concepts, but it also has serious modernization needs. Correct them without changing business outcomes silently.

### Money and quantities

- Never use floating-point types for money.
- Use PostgreSQL `numeric/decimal` with explicit precision/scale.
- Use decimal quantities for stock where products can be sold fractionally.
- Define rounding rules centrally by currency, unit and tax context.
- Preserve exact legacy values during migration and report any unavoidable rounding normalization.

### Dates and time

- Replace `longtext` dates and inconsistent Unix timestamps with proper `date`, `time`, `timestamp with time zone`, and `timestamp` fields as appropriate.
- Store server timestamps in UTC and render in the business timezone.
- Default Ghana tenants to `Africa/Accra` but make timezone configurable.

### Statuses and references

- Replace free-text status fields with controlled enums/reference tables and state machines where business lifecycle matters.
- Preserve original sales order, invoice, receipt, PO, waybill, deposit, return and other document numbers during migration.
- Introduce collision-safe, tenant/branch-aware document sequencing for new records.

### Ledgers, not mutable balances

For stock, accounting, payments and customer/supplier balances, use append-only transaction/ledger records as the source of truth. Materialized/current balances may exist for performance, but they must be rebuildable and reconciled from ledgers.

### No destructive financial edits

Posted financial/stock transactions must not be silently edited or deleted. Use void/reversal/correction workflows with reason, user, timestamp and approval where required.

## 6. Legacy business domains that must be preserved and improved

Reverse-engineer and preserve the real behavior around at least these domains evidenced by the legacy application/schema:

### Sales and POS

- POS sales;
- sales orders;
- invoices;
- receipts;
- proforma invoices/quotations;
- deposits/advance payments;
- paid, unpaid and part-paid sales;
- cash sales and credit sales;
- customer-specific prices;
- sales-person attribution;
- waybill/document code control;
- item picking/quantity picked/quantity due;
- discounts;
- tax-inclusive and tax-exclusive sales;
- returns, refunds, store credit and credit notes;
- negative-stock/negative-balance policies where intentionally supported;
- customer statements and receivables.

Redesign the lifecycle explicitly, for example:

`draft -> held -> confirmed -> picking -> picked -> dispatched -> invoiced -> part_paid/paid -> partially_returned/returned -> closed/voided`

Do not force this exact state list if the audit shows a better domain model, but make state transitions explicit, validated and tested.

### Inventory and stock

- items/products;
- main and sub categories;
- suppliers;
- purchase price and selling price;
- multiple warehouses/shops/depots;
- shelves/bin locations;
- item transfers;
- stock opening/closing sessions where still needed;
- stock in/out/adjustments;
- stock history;
- backlog/stock reports;
- reorder levels and stock alerts;
- stock counts/cycle counts;
- damaged/quarantined stock;
- lot/batch/expiry support where product type requires it.

Create an immutable stock ledger. Every quantity change must have an auditable movement reason and source document.

### Multi-unit and package conversions

The old system supports packages and alternative units. Rebuild this cleanly so a business can buy in one unit and sell in another.

Examples include:

- box -> pieces;
- coil -> yards;
- bundle -> pieces;
- bag -> smaller unit where configured;
- tonne -> pieces/weight-derived unit where defined;
- any configurable product-specific conversion.

Requirements:

- product base unit;
- purchasing unit(s);
- selling unit(s);
- exact conversion factor;
- unit code, label and price;
- effective dates for price changes;
- customer/segment-specific price lists;
- conversion audit trail;
- no cumulative floating-point drift.

### Purchasing and suppliers

- purchase orders;
- goods receipt separate from PO where appropriate;
- supplier invoices;
- accounts payable;
- direct payments;
- part payments;
- supplier statements;
- credits/returns to supplier;
- purchase cost and landed-cost allocation where useful;
- approval thresholds;
- procurement audit trail.

Separate the concepts of PO, receipt/GRN, supplier invoice and payment even if the legacy app collapsed some of them.

### Customers, debtors and credit

- customer master data;
- phone-first Ghana-friendly records where email is optional;
- customer balances and statements;
- receivables;
- opening balances;
- credit limits/terms;
- aging buckets;
- payment allocation to one or many invoices;
- deposits/unapplied cash;
- customer-specific pricing;
- loyalty/tiers/rewards where enabled;
- store credit from returns.

### Accounting and banking

Preserve the intent of the legacy accounts, journal, payable/receivable, debtor/creditor and report features but rebuild on a proper double-entry engine.

Required capabilities:

- chart of accounts;
- journals and posting batches;
- double-entry debit/credit validation;
- AR and AP subledgers;
- cash, mobile-money/e-payment, bank, cheque and configurable accounts;
- account transfers;
- bank/cash reconciliation;
- trial balance;
- income statement/P&L;
- balance sheet;
- cash-flow reporting;
- audit trail from report -> journal -> source document;
- locked periods and controlled adjustments.

Every posted journal batch must balance. Use database transactions so sales, stock, tax, payment and accounting postings cannot partially succeed.

### Returns/refunds

The legacy schema already contains return reasons, sales returns, returned items, refund transactions, store credits and a returns audit trail. Build this as a first-class workflow:

- full/partial return;
- full/partial refund;
- exchange;
- restockable/non-restockable/damaged/quarantine disposition;
- refund to original method where supported;
- cash/bank/store-credit/credit-note handling;
- approval rules;
- reversal of revenue, tax, COGS, inventory, customer balance and payment/account postings;
- immutable audit history.

### Shops, branches and staff

- multi-depot/multi-shop/multi-branch support;
- branch-scoped stock and reporting;
- staff assignments;
- attendance/shift concepts only where they belong to depot operations;
- cashier shifts and cash-drawer sessions;
- opening float;
- cash in/out;
- counted cash;
- variance and supervisor approval.

## 7. Correct legacy calculation and logic problems

Do not reproduce a calculation simply because the old code performs it. For every financial, tax, inventory, payment, receivable/payable, margin, stock and reporting formula:

1. locate the legacy implementation;
2. write down its inputs and formula;
3. compare it with accounting/inventory invariants and the database evidence;
4. identify duplicate or conflicting implementations;
5. create executable tests that capture the valid expected behavior;
6. correct errors deliberately;
7. document any behavior change and how migration/reconciliation protects clients.

Specific areas to scrutinize:

- `double`/`float` money arithmetic;
- grand totals repeated on every order line;
- discounts applied at line vs order level;
- amount, amount_paid and amount_due consistency;
- previous-payment fields and duplicate payment history;
- customer/supplier balance mutations;
- debtor/creditor duplication;
- stock balances stored in multiple tables;
- opening entries;
- item balance after purchase/sale/transfer/return;
- unit conversion balances;
- customer-specific price tables;
- cost price and gross-margin calculation;
- tax components and tax-inclusive/exclusive math;
- refunds and stock/accounting reversals;
- cash received reports;
- AR/AP aging;
- trial balance/P&L/balance-sheet consistency;
- document code reuse and “not used” states;
- timezone/date comparisons.

Create property/invariant tests such as:

- `debits == credits` for every posted journal batch;
- `invoice_total = net + tax - order_discount +/- allowed adjustments`;
- `amount_due = invoice_total - valid_allocated_payments - valid_credits`;
- stock ledger movements reconcile to on-hand quantity;
- a completed return/refund produces the exact inverse postings required by policy;
- unit conversions conserve physical quantity within defined precision;
- no paid invoice can have a positive due amount unless a documented correction/reversal explains it.

## 8. Ghana-tailored behavior

Design iDepot for Ghana first while keeping the core extensible.

- Currency: Ghana cedi, displayed as `GH₵` or `₵` according to the selected UI convention; internally use ISO `GHS`.
- Timezone default: `Africa/Accra`.
- Ghana phone number validation/normalization; email must not be mandatory for customers.
- Payment adapters for Ghana-relevant providers and methods, but do not hard-code one vendor into business logic.
- Mobile Money, bank, cash, cheque and electronic payment should be configurable accounting/payment methods.
- Keep Hubtel or other integrations behind provider interfaces and secrets in secure environment/secret stores.
- Tax engine must be **effective-dated and configurable**. Do not hard-code old VAT/NHIL/GETFund/COVID rates from the legacy database. Support Ghana-specific tax components and receipts, but implement current rates/configuration from authoritative settings at deployment time.
- Support VAT-inclusive and VAT-exclusive pricing.
- Support businesses with multiple depots/warehouses and sales points.
- Optimize UX for intermittent connectivity and lower-powered POS machines.
- Produce print layouts suitable for common thermal receipt printers and A4 invoices/waybills.

## 9. Offline-first architecture

Offline-first is mandatory, not a later PWA enhancement.

### Desktop/mobile local data

Use local SQLite on Windows/macOS/iOS/Android for the operational subset required to transact offline. Cache only data the signed-in user/branch is authorized to hold.

### Web offline support

Use an IndexedDB-backed queue/cache where appropriate. A full browser offline database does not need to mirror all server data if that would be unsafe or impractical, but POS-critical web workflows should degrade gracefully.

### Sync protocol

Implement a deterministic sync model with:

- globally unique client-generated IDs (UUID/ULID strategy);
- idempotency keys;
- client/device IDs;
- monotonic entity versions or change sequence;
- outbox/inbox pattern;
- tombstones/soft delete where synchronization requires them;
- resumable incremental pull;
- dependency-aware push order;
- retry with exponential backoff;
- duplicate-event protection;
- transaction grouping for operations that must sync atomically;
- conflict policies documented per entity type.

Never resolve a financial conflict by silent last-write-wins. Prefer append-only transactions and explicit conflict/approval workflows.

Expose clear sync state in the UI: online/offline, last successful sync, pending transactions, failures requiring attention and safe retry.

## 10. POS hardware architecture

Create a hardware abstraction layer so the business domain does not know device-specific commands.

Desktop/Tauri should provide adapters for:

- barcode scanners acting as keyboard/HID;
- USB/serial scanners where needed;
- ESC/POS receipt printers;
- cash drawer pulse through compatible receipt printer interfaces;
- label printers;
- optional weighing scales/serial devices if later enabled;
- optional customer-facing display.

Requirements:

- hardware test/setup screen;
- printer/cash-drawer profiles per terminal;
- safe device permissions;
- offline printing;
- reprint permissions and reprint audit log;
- no browser-only workaround for hardware that requires native access.

## 11. Authentication, RBAC and authorization

Replace legacy `level` checks with proper **RBAC plus scope/attributes**.

Start with roles such as:

- Platform/Super Administrator;
- Business Owner/Director;
- Branch/Depot Manager;
- Sales Manager;
- Cashier/POS Operator;
- Shop/Store Attendant;
- Inventory/Warehouse Officer;
- Procurement Officer;
- Accountant/Finance Officer;
- Sales Representative;
- Dispatch/Loading Officer;
- Auditor/Read-only Analyst;
- Support/Implementation user with explicitly granted tenant access.

Do not hard-wire permissions to these role names. Build granular permissions and allow tenant administrators to compose roles.

Permission examples:

- sales.view/create/discount/void/approve;
- invoice.issue/reprint;
- payment.receive/refund/allocate/void;
- inventory.view/adjust/transfer/approve;
- purchase.create/approve/receive/pay;
- banking.view/reconcile/transfer;
- accounting.post/reverse/close_period;
- customer.credit_limit.manage;
- reports.financial.view/export;
- users.manage/roles.manage;
- settings.manage/integrations.manage;
- ai.insights.view/ai.actions.approve.

Scope permissions by tenant, branch/depot, shop, warehouse and sometimes assigned salesperson. Enforce authorization on the server for every API operation; hiding a UI control is never sufficient.

Support secure PIN re-authentication/supervisor override for sensitive POS actions while retaining full user identity in audit logs.

## 12. Security and audit requirements

The legacy archive contained hard-coded credentials. The new architecture must never repeat this.

- secrets only in environment/secret-management systems;
- no secrets in Git history, sample data or client bundles;
- Argon2id or an equally strong password hashing approach;
- MFA for privileged roles where appropriate;
- secure refresh/session token handling;
- device/session management and revocation;
- CSRF/XSS/SQL-injection protections appropriate to architecture;
- strict DTO/schema validation;
- rate limiting and brute-force protection;
- encrypted transport everywhere;
- secure local credential storage using OS keychain/secure storage;
- tenant isolation and branch scoping tested automatically;
- append-only security/financial audit events;
- export/download permissions and audit;
- backup/restore strategy and disaster-recovery tests;
- no production PII in test fixtures.

## 13. Modern UX/UI requirements

Build a clean, professional, information-dense interface suitable for desktop offices, warehouse counters and touchscreen POS terminals, while remaining fully responsive on phones/tablets.

Principles:

- consistent design system and spacing;
- fast keyboard-first POS workflow;
- touch-friendly targets on POS/mobile;
- responsive tables/cards with no horizontal page overflow;
- sticky headers/actions where useful;
- role-based home dashboard;
- global search/command palette for customers, products and documents;
- clear breadcrumbs and module navigation;
- empty/loading/error/offline states designed explicitly;
- inline validation and human-readable errors;
- destructive actions require proper confirmation/reason;
- accessible contrast, keyboard navigation and screen-reader semantics;
- light and dark themes;
- print views intentionally designed, not browser screenshots;
- totals and payment status visually prominent;
- financial values formatted consistently;
- user can see who created/approved/voided/reversed a sensitive transaction.

For POS specifically:

- barcode scan should focus/add rapidly without mouse use;
- customer can be selected quickly or guest/cash customer used by policy;
- product search works by name/SKU/barcode;
- quantity, unit, price and permitted discount are fast to edit;
- payment dialog supports split/multiple tenders where enabled;
- change due is prominent;
- hold/resume sale;
- offline sale state is unmistakable but non-disruptive;
- receipt prints immediately after successful local commit;
- sync happens independently afterward.

## 14. Advanced AI features

AI should enhance operations without being allowed to silently corrupt financial records.

Create a Python/FastAPI AI service with versioned models/features, auditable inputs/outputs and permission-aware access. Start with deterministic analytics where they outperform “chat” and add generative interfaces on top.

Target features:

1. **Demand forecasting** per item/branch with seasonality and confidence intervals.
2. **Reorder recommendations** using demand, lead time, safety stock, current stock and open PO quantities.
3. **Stockout/overstock risk** alerts.
4. **Slow-moving/dead-stock detection**.
5. **Gross-margin and pricing assistant** using cost, customer price history, target margin and inventory velocity; suggestions only unless approved.
6. **Sales forecasting and target tracking**.
7. **Customer segmentation** and retention/at-risk signals.
8. **Credit-risk assistant** using payment history, aging and purchasing behavior; explainable and never the sole basis for a high-impact denial.
9. **Supplier performance scoring** using delivery time, fill rate, cost variance and quality/return history.
10. **Cash-flow forecasting** from AR/AP, expected collections, recurring expenses and purchasing plans.
11. **Anomaly/fraud detection** for unusual discounts, voids, refunds, reprints, stock adjustments, cash variances and after-hours activity.
12. **Smart reconciliation assistant** for matching bank/mobile-money/payment references to internal transactions.
13. **Stock-count discrepancy assistant** that prioritizes suspicious items and likely causes.
14. **Document OCR/intelligence** for supplier invoices, receipts, delivery notes and waybills, with human confirmation before posting.
15. **Duplicate customer/supplier/item detection** during migration and daily use.
16. **Natural-language business intelligence**: authorized users can ask questions such as “What were our top 10 items by gross profit this month?” and receive answers backed by query evidence.
17. **Executive daily briefing** covering sales, margin, stock risks, receivables, payables, cash position and anomalies.
18. **Predictive alerts** with actionable reasons, not generic “AI insights”.

Rules for AI:

- distinguish prediction from fact;
- show confidence/uncertainty when meaningful;
- log model/version/features used for material recommendations;
- tenant data isolation is mandatory;
- never train across tenants without explicit product/legal approval and privacy design;
- financial postings require deterministic validation and appropriate human approval;
- provide graceful non-AI fallback so the core POS/business system remains fully usable if AI is unavailable.

## 15. Migration from existing clients is a first-class deliverable

Existing customers are already using the legacy application. The new system is not complete until migration is safe, repeatable and reconciled.

### Migration strategy

Build an idempotent migration toolchain that can accept full production MySQL dumps even though the repository only contains a sanitized first-10-row sample.

Recommended process:

1. load original dump into a quarantined/staging MySQL instance or parser;
2. copy source records to a `legacy_raw`/staging layer without mutating originals;
3. validate encoding, dates, orphaned foreign keys and malformed values;
4. transform to normalized PostgreSQL target entities;
5. preserve `legacy_table`, `legacy_id`, original document codes and useful source hashes;
6. write mapping tables between old and new IDs;
7. migrate master data before transactional data;
8. rebuild derived balances from transactions where possible;
9. reconcile old stored balances against recomputed balances;
10. output discrepancy reports instead of silently forcing totals;
11. support dry runs and repeated reruns;
12. provide cutover and rollback procedures.

### Required reconciliation reports

At minimum compare old vs new:

- customer count and customer balances;
- supplier count and supplier balances;
- item count and quantity on hand by item/location;
- total inventory value under the agreed costing method;
- invoices by status and total/due/paid;
- sales totals by day/month/customer/item;
- payments/receipts totals by method/account;
- AR and AP totals;
- cash/bank/mobile-money account balances;
- journal debit/credit totals;
- trial balance;
- returns/refunds/store credits;
- open purchase orders and receivables/payables;
- document number uniqueness and continuity where required.

Generate a machine-readable reconciliation JSON plus a human-readable report for each migration run.

### Parallel-run/cutover

Plan for pilot migration, user acceptance, a limited parallel-run period where needed, final delta migration, freeze/cutover, post-cutover reconciliation and rollback criteria.

## 16. New PostgreSQL domain model direction

Design the new schema from business concepts rather than doing a one-for-one table rename. Expected conceptual areas include:

- tenants/businesses;
- branches/depots;
- warehouses/shops;
- users;
- roles/permissions/user-role scopes;
- devices/POS terminals;
- cashier shifts/drawer sessions;
- customers/customer addresses/customer credit terms;
- suppliers;
- product categories;
- products/SKUs/barcodes;
- units/package conversions;
- price lists and price-list items;
- customer/segment price assignments;
- inventory locations/bins;
- stock ledger/stock movement lines;
- stock counts and adjustments;
- transfer orders/transfer lines;
- purchase orders/PO lines;
- goods receipts/GRN lines;
- supplier invoices/lines;
- sales orders/lines;
- quotations/proformas;
- invoices/invoice lines;
- payments/payment tenders;
- payment allocations;
- deposits/unapplied cash;
- returns/return lines;
- refunds;
- credit notes/store credits;
- tax definitions/effective tax rates/tax lines;
- chart of accounts;
- journal entries/journal lines;
- accounting periods;
- bank/reconciliation records;
- loyalty programs/transactions/rewards;
- targets/KPI snapshots;
- audit events;
- notifications;
- sync devices/change feed/outbox/idempotency records;
- migration maps/legacy references;
- AI model runs/predictions/alerts/feedback.

Use foreign keys, unique constraints, check constraints and database transactions to enforce important invariants.

## 17. API and event design

- Version public API contracts.
- Use OpenAPI generated from NestJS and typed clients where practical.
- Every mutating operation accepts an idempotency key when duplicate retries are possible.
- Use domain/application services rather than controllers containing business formulas.
- Publish domain events/outbox records for cross-module consequences, analytics, notifications and AI jobs.
- Avoid distributed transactions; keep financially coupled operations in one authoritative core DB transaction.
- AI/service integrations consume events asynchronously and cannot be required for a POS sale to complete.

## 18. Testing strategy

A rewrite without behavioral verification is unacceptable.

### Legacy/golden-master tests

Use the sanitized schema/sample and extracted legacy formulas to build golden fixtures for important workflows. When legacy behavior is wrong, keep a test documenting the old result and a separate approved test for the corrected rule so the change is explicit.

### Core tests

- unit tests for all domain calculations/state transitions;
- property/invariant tests for accounting, inventory and unit conversions;
- PostgreSQL integration tests;
- API authorization/tenant-isolation tests;
- migration transformation/reconciliation tests;
- offline sync/idempotency/conflict tests;
- hardware-adapter contract tests;
- Playwright web E2E;
- desktop smoke/E2E for Windows/macOS where CI permits;
- React Native critical-flow tests;
- pytest suites for AI service;
- model backtests with time-aware splits for forecasts/anomaly models;
- load tests for POS bursts, reports and sync;
- security/static dependency scanning.

Critical flows that must have end-to-end tests:

- cash sale;
- credit sale;
- part payment then final payment;
- customer deposit then allocation;
- purchase -> receipt -> supplier invoice -> payment;
- inventory transfer;
- unit conversion sale;
- return/restock/refund;
- cashier shift open/close with variance;
- offline sale -> reconnect -> idempotent sync;
- accounting posting/reversal;
- production-style migration dry run and reconciliation.

## 19. Observability and operations

Implement structured logs, request IDs/correlation IDs, audit IDs, metrics and error tracking. Add health/readiness endpoints. Track sync backlog, queue failures, migration failures and AI job failures.

Provide:

- Docker-based local development;
- documented environment variables;
- automated PostgreSQL migrations;
- seed data separated from production migration data;
- CI for lint/typecheck/tests/build/security checks;
- staging deployment workflow;
- backup/restore procedure;
- migration runbook;
- release notes and semantic versioning strategy.

## 20. Implementation phases and mandatory deliverables

Do not jump straight into screen redesign. Work in controlled phases and keep the repo runnable.

### Phase 0 — forensic audit and architecture

Create:

- `docs/legacy-audit/view-classification.md`
- `docs/legacy-audit/controller-model-map.md`
- `docs/legacy-audit/table-business-map.md`
- `docs/legacy-audit/calculation-register.md`
- `docs/legacy-audit/defects-and-risks.md`
- `docs/architecture/system-context.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/offline-sync.md`
- `docs/architecture/security-rbac.md`
- `docs/migration/legacy-to-postgres-map.md`

Each relevant legacy business rule should point back to the source file/function/table that proved it.

### Phase 1 — monorepo foundation

Scaffold applications/packages, CI, PostgreSQL, auth, tenant/branch model, RBAC, audit events, design system, API contracts and baseline sync primitives.

### Phase 2 — master data and inventory

Products, categories, units/conversions, price lists, customers, suppliers, locations, stock ledger, stock counts and transfers.

### Phase 3 — sales/POS

Fast POS, sales orders, proforma/quotation, invoices, deposits, payments, receipts, printing, drawer shifts and offline transactions.

### Phase 4 — purchasing and accounting

PO/receiving/supplier invoices/AP, chart of accounts, double-entry posting, banking/reconciliation, AR/AP, financial statements.

### Phase 5 — returns, reporting, loyalty and administration

Returns/refunds/store credit, operational/financial reports, loyalty, targets, configuration, comprehensive audit UX.

### Phase 6 — desktop/mobile and hardware hardening

Windows/macOS installers, iOS/Android flows, scanner/printer/cash-drawer adapters, device management, offline synchronization stress testing.

### Phase 7 — AI intelligence

Forecasting, anomaly detection, recommendations, document AI and natural-language analytics after the transactional source of truth is correct.

### Phase 8 — migration and cutover tooling

Full importer, mapping/reconciliation reports, pilot procedure, performance hardening and client-by-client cutover runbook.

## 21. Working rules for this repository

1. Create a dedicated feature branch for the rebuild; do not rewrite the sanitized legacy artifacts.
2. Commit in meaningful vertical slices.
3. Keep `main` buildable.
4. Do not commit generated dependency directories such as `node_modules`.
5. Never commit secrets or production client data.
6. Do not claim a module is complete until its tests pass and the relevant end-to-end flow works.
7. Do not replace working business behavior with placeholders or hard-coded demo data.
8. Do not remove a legacy feature merely because the old UX is poor; classify whether the business capability is still needed.
9. When fixing a legacy calculation, document the old logic, the defect, the new invariant and migration impact.
10. Prefer clear domain services and tests over large “god” controllers like the legacy `Admin.php`.
11. Prefer database-enforced integrity over UI-only validation.
12. All sensitive server authorization must be checked on the API, not only in the frontend.
13. Make offline and hardware behavior real, not mock-only.
14. AI must be optional to core transaction completion and must not silently post accounting entries.
15. Keep a `docs/STATUS.md` showing phase, completed capabilities, current blockers, tests and next actions.

## 22. First actions — start here

Your first implementation cycle must do the following in this order:

1. Clone/open `christianagbotah/idepot` and inspect the repository.
2. Read this prompt and `legacy/SECURITY-NOTE.md`.
3. Audit `legacy/source/` in place as read-only forensic evidence; do not treat it as new application source code.
4. Parse `legacy/schema/legacy_mysql_schema.sql` as the legacy schema reference. Do not assume every table belongs to iDepot; prove relevance through controllers, models, routes and retained business views.
5. Inspect all retained business views, controller methods, models and schema tables.
6. Cross-reference routes -> views -> controller methods -> model/database operations.
7. Produce the Phase 0 audit documents and identify the exact business modules that exist today.
8. Produce a proposed PostgreSQL ER/domain model and legacy mapping.
9. Identify all calculation inconsistencies and financial/inventory risks before porting them.
10. Scaffold the modern monorepo only after the audit has enough evidence to preserve behavior safely.
11. Add tests early: accounting invariants, stock invariants, payment allocation, unit conversion and migration mapping must not be deferred.
12. Continue implementation phase by phase, keeping the repo working and documented.

## 23. Definition of done

iDepot Next Generation is not “done” because the screens look modern. It is done when:

- the relevant legacy depot workflows are mapped and preserved or deliberately improved;
- school-management leftovers are excluded from product scope;
- web, Windows, macOS, iOS and Android clients cover their intended flows;
- POS scanner/receipt-printer/cash-drawer integrations work through the native hardware layer;
- core POS workflows work without internet and synchronize safely later;
- RBAC/tenant/branch isolation is enforced server-side;
- inventory is ledger-based and reconciles;
- accounting is double-entry and balances;
- calculations use decimal-safe logic and tested invariants;
- sales, purchases, payments, AR/AP, returns/refunds and reporting are consistent;
- Ghana-specific currency, phone, payment and configurable tax needs are addressed;
- AI features are useful, explainable and non-blocking to core operations;
- full-client migration can be dry-run repeatedly from legacy MySQL to PostgreSQL;
- reconciliation reports prove that migrated balances/transactions are complete or clearly identify discrepancies;
- CI passes and critical E2E tests pass;
- there are no secrets or real client PII in the repository;
- deployment, backup, restore, migration and rollback are documented.

Take ownership of the engineering decisions, but preserve traceability: when you make a significant architectural or business-rule choice, document the decision and evidence in the repository rather than silently changing behavior.
