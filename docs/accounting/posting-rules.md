# Phase 4 Posting Rules

Every financially coupled operation commits **all** authoritative effects
synchronously in ONE PostgreSQL transaction through the Posting Coordinator /
Unit of Work (ADR-0001). Account resolution is ALWAYS by
`gl_mapping` purpose — never by hard-coded account ids or codes at posting
time. All money is exact-decimal scaled-BigInt (`numeric(18,4)`), quantities
`numeric(18,6)`, one rounding mode: half-even.

## Purpose catalog (migration 0009)

| Purpose | Seeded account | Class | Used by |
| --- | --- | --- | --- |
| `cash` | 1000 Cash on Hand | asset | sales tenders, supplier payments, manual journals |
| `bank_clearing` | 1010 | asset | bank tenders without a concrete bank account |
| `momo_clearing` | 1020 | asset | mobile-money tenders |
| `cheque_clearing` | 1030 | asset | cheque tenders |
| `accounts_receivable` | 1100 | asset | credit sales, receipts, AR opening |
| `inventory` | 1200 | asset | GRNs, COGS issues, adjustments, returns |
| `supplier_advance` | 1310 Advances to Suppliers | asset | unapplied supplier payments |
| `input_tax_recoverable` | 1400 | asset | recoverable purchase tax |
| `customer_deposit_liability` | 2100 | liability | deposits, credit applications |
| `tax_payable` | 2200 | liability | sales tax components |
| `accounts_payable` | 2300 | asset→liability | supplier invoices, payments, AP opening |
| `grni_clearing` | 2310 GR/IR Accrual | liability | receipts vs invoices |
| `retained_earnings` | 3900 | equity | period close (future closing entries) |
| `opening_balance_equity` | 3950 | equity | opening balances, migration plug |
| `sales_revenue` | 4000 | revenue | sales |
| `inventory_adjustment_gain` | 4100 | other_income | upward adjustments/count gains |
| `cogs` | 5000 | cost_of_sales | sale COGS (AVCO evidence) |
| `purchase_expense` | 5100 | operating_expense | non-inventory purchases, non-recoverable tax |
| `purchase_price_variance` | 5200 | operating_expense | invoice-vs-receipt price differences |
| `inventory_adjustment_loss` | 5300 | operating_expense | write-offs/shrinkage/count losses |
| `bank_fee_expense` | 5400 | operating_expense | transfer fees |

## Document posting rules

### Sale (Phase 3, unchanged)
Dr tender controls (gross money tenders) + Dr customer deposits consumed +
Dr accounts receivable (remaining due) + Dr COGS /
Cr sales revenue (net) + Cr tax payable (per component, override account when
configured) + Cr cash (change given) + Cr inventory (AVCO COGS).

### Goods receipt (GRN) — the stock authority
Stock: append-only `receipt` movement per line, AVCO layer
`round4(qty_base × unit_cost)` (unit_cost is per BASE unit; the conversion
factor is resolved server-side from `product_unit`).

```
Dr inventory            Σ round4(qty_base × unit_cost)
Cr grni_clearing        Σ round4(qty_base × unit_cost)
```

Over-receipt beyond `po_overreceipt_tolerance_pct` requires a verified
supervisor approval (`purchasing:approve` credentials checked server-side);
within tolerance it is tolerated evidence.

### Supplier invoice — the AP authority (3-way match)
Match evidence (`match_review_item`) is recorded per line: price vs PO
(`match_price_tolerance_pct` relative OR `match_value_tolerance` absolute),
quantity (cumulative invoiced vs ordered). **The invoice is never rewritten
to force a match**; exceptions require a verified approval before posting.
Inventory lines MUST reference a GRN line (invoice-before-receipt is
structurally prevented); expense lines post to a named account or
`purchase_expense`.

Tax: effective-dated engine, transaction-time evidence rows in
`supplier_invoice_tax_component` (including the `recoverable` flag). Supplier
invoice lines are **tax-exclusive by design** — enter inclusive supplier
pricing net of tax (enforced by validation).

```
Dr grni_clearing              Σ GRN line values (receipt cost)
Dr purchase_price_variance    Σ max(0, invoice_net − grn_value)     (unfavourable)
Cr purchase_price_variance    Σ max(0, grn_value − invoice_net)     (favourable)
Dr <expense accounts>         Σ expense line nets
Dr input_tax_recoverable      Σ recoverable component amounts
Dr purchase_expense           Σ non-recoverable component amounts
Cr accounts_payable           invoice total
```

Balanced by construction: inventory value is recognized at GRN time and
NEVER re-valued at invoice time — the invoice-vs-receipt difference is the
explicit PPV (ADR-0004; no historical COGS recalculation).

### Supplier payment (+ explicit allocations)
`amount = Σ allocations + unapplied` (enforced by the service AND the
`supplier_payment_allocation_guard` DB trigger). Allocations serialize on a
transaction-scoped advisory lock per invoice domain; over-allocation is a
deterministic 409, never a raw 23505.

```
Dr accounts_payable    Σ allocations
Dr supplier_advance     unapplied amount
Cr <tender account>     payment amount   (the named bank account's own GL
                                          account for bank/cheque tenders)
```

Advance application (later): `Dr accounts_payable / Cr supplier_advance`.

### Supplier adjustment (debit / credit note) — append-only correction
The source invoice is never edited. Credit note:

```
Dr accounts_payable          amount
Cr inventory                 Σ returned-stock AVCO cost (issue movements,
                              reason supplier_return, posted in the SAME tx)
Cr purchase_expense          amount − stock value   (price correction)
Dr purchase_expense          stock value − amount   (when returns exceed credit)
```

Debit note: `Dr purchase_expense / Cr accounts_payable`.
Corrections may post into a **soft-closed** period, never a closed one.

### Bank transfer (with fee)
```
Dr <destination bank GL>     amount
Dr bank_fee_expense          fee
Cr <source bank GL>          amount + fee
```
Value conservation: the destination receives exactly the amount; the fee is
an explicit posted charge. Same-account transfers are rejected. Duplicate
`client_doc_id` is a clean 409.

### Inventory adjustments / count variances / write-offs (backfill)
Live adjustments post through StockPoster; the Phase 4 backfill posts the GL
for historical non-sale movements that lack journals:

```
gain:  Dr inventory / Cr inventory_adjustment_gain (or opening_balance_equity
       for reason 'opening_balance')
loss:  Dr inventory_adjustment_loss / Cr inventory
```

Warehouse transfers post NO journal (the inventory control is one account;
value moves between warehouse cost states — Σ transfer-in values ==
transfer-out value, always).

### Party opening balances
```
customer, amount > 0:  Dr accounts_receivable / Cr opening_balance_equity
supplier,  amount > 0:  Dr opening_balance_equity / Cr accounts_payable
supplier,  amount < 0:  Dr supplier_advance / Cr opening_balance_equity
```

### Migration opening trial balance
One `migration_opening` journal per tenant (ever): built from canonical
documents (stock value from `stock_cost_state`, AR/AP from opening documents
+ open imported invoices, cash/bank from the legacy balances — recorded with
drift evidence). Any residual imbalance is the **explicit, isolated,
quantified equity plug** on `opening_balance_equity`, recorded as a
reconciliation record requiring accountant sign-off. Legacy journals are
imported as reference only (D8/D9).

### Manual journal
Permission `accounting:journal`; balanced (domain builder + DB deferred
trigger); business-date period validation; audited. Reversal = a NEW entry
with `reversal_of` linkage (append-only; posted GL is never edited).
Source-document journals can only be reversed by their own correction
documents.

## Period lock (single choke point)

`FinancialConfigurationService.assertPeriodOpen` runs inside
`postJournal` — every financially coupled document inherits it:

- `open`: posting allowed.
- `soft_closed`: only correction documents (reversals, debit/credit notes,
  backfill, migration) — `allowSoftClosedPeriod`.
- `closed`: nothing posts; reopening requires `accounting:close` + an
  audited reason (≥ 10 chars).
- No period configured for the date: unrestricted (a tenant that has not
  adopted period control is unaffected).

## Concurrency contract

| Race | Mechanism | Loser receives |
| --- | --- | --- |
| Simultaneous GRNs vs PO remaining | sorted `FOR UPDATE` on PO lines + over-receipt tolerance | 409 over-receipt |
| Duplicate supplier invoice | UNIQUE (tenant, supplier, number) | 409 duplicate |
| Simultaneous invoices vs one GRN line | sorted `FOR UPDATE` on GRN lines | 409 over-billing |
| Simultaneous AP allocations | advisory xact lock per invoice domain + canonical open re-read | 409 over-allocation |
| Duplicate payments / transfers | UNIQUE (tenant, client_doc_id) | 409 duplicate |
| Period close vs posting | period row status read in the posting tx | 409 period closed |
| Numbering | row-locked counter UPDATE | never duplicated |
