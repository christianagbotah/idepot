# Refund / Return / Store-Credit Workflow Map

## 1. What actually exists (as-built)

### 1.1 The only live engine: `Admin::sales_order_refund('create', $so_code, $ids)` (Admin.php:9809-10396)

Despite its name, this is **not** a refund document system — it is a *destructive in-place amendment of the original sales order* that reduces quantities, restores stock and re-derives all money figures:

1. Collects per-item `order_picked_*`, `order_returned_*`, prices; rejects returned > picked (9867-9880).
2. Mutates `sales_order` per item: `amount -= price×qty_returned`, `quantity -= returned`, `quantity_picked -= returned`, `refund = 1`, `amount_refunded = posted amount_paid` (9896-9930). ⚠️ **`quantity_returned`, `amount_refunded`, `refund` are not columns of `sales_order`** (schema:909-958) → the UPDATE fails; the whole flow is broken against the current schema.
3. Stock restore with a re-return inflation bug: reads previous `quantity_returned` (wrong column for its purpose), adds it back, subtracts new picks (9921-9954) — items with prior returns get their old returns re-added to stock each time (progressive stock inflation).
4. General Sales account: subtract old `grand_total`, add new (10006-10014); Sales journal lines updated to the new total (10024-10064); invoice row recomputed (10068-10112).
5. AR adjustment: `receivable_diff = (hidden_total − journal balance) − (amount_paid − account balance)` (10115-10123).
6. Payment row upsert keyed loosely by `so_code` (**updates all payment rows of the order at once**, 10128-10210); overpayment → AP += negative due.
7. Cash account movements; the **refund account is chosen freely in the UI** (`Refund From:` select of transferrable non-bank accounts, `refund_sales_order.php:326-344`) — not forced to the original tender.
8. Entry UI: `modal/popup_sales/refund_sales_order/<so_code>` — but the view **hardcodes** `$so_code = 'DP1SO-42299'` and `$param2` is commented out (`refund_sales_order.php:2`, submit at 557).
9. `$param4 == 'goods'` branches are **unreachable** (function signature has only 3 params; tested at 10075, 10096, 10115).

**No return reason, no approval, no separate credit document, no audit trail.**

### 1.2 Returns-adjacent mechanisms elsewhere

| Mechanism | What it really is | Where |
|---|---|---|
| `sales_order_refund` | In-place order amendment (broken) | above |
| `sales_order_negative_bal` | Spending customer credit on goods (not a return) | [sales-pos-lifecycle.md](sales-pos-lifecycle.md) |
| Deposits → negative invoices | Customer credit store | [payment-transaction-map.md](payment-transaction-map.md) §6 |
| `payment_with_goods` re-pick | Delivery amendment (can reduce picked qty) | 12848-12865 |
| Sales-order edit/delete | Full reversal + cascade rewrites | `Crud::delete_sales_order` |

## 2. The designed-but-dead returns subsystem

The schema contains a complete, modern returns design that **no code ever references** (verified by repository-wide search — matches only in the schema file):

- `return_reasons` (schema:858-869): 17 seeded reasons, `requires_approval`, sort order.
- `sales_returns` (984-1006): header with `return_code`, `original_so_code`, `original_invoice_code`, reason FK, `return_status` enum(Pending/Approved/Rejected/Processed/Completed), refund method enum(Cash/Bank Transfer/Credit Note/Store Credit), approver/processor stamps, track_code.
- `sales_return_items` (964-982): per-line quantity returned, unit price, condition enum(New/Like New/Good/Fair/Damaged), `restock_status` enum(Yes/No/Damaged), restock location FK.
- `refund_transactions` (836-856): `refund_code`, method, `refund_account_id`, status enum(Pending/Processing/Completed/Failed), reference, processor.
- `store_credits` (1130-1149): `credit_code`, amounts, status enum(Active/Used/Expired/Void), expiry.
- `returns_audit_trail` (871-888): action-type history with previous/new status, IP, user agent.

All are FK-linked to `sales_returns` with `ON DELETE CASCADE`; all have empty/near-empty AUTO_INCREMENT. **Verdict:** modernization-prep DDL that was never wired — this is the natural seed for the new returns module (confirming the intended business rules listed above match the master prompt's returns requirements).

## 3. Business rules to preserve

From live behaviour and the dead DDL, the business intent is:
- full/partial return of picked goods against an original SO/invoice;
- stock restoration with condition disposition (restockable vs damaged);
- money returned via cash/bank/credit-note/store-credit at a chosen account;
- overpaid orders produce customer credit;
- refund amount derived from returned quantity × original price, respecting order-level discount allocation.

## 4. Corrected model (target)

- `return_order` document (full/partial, per-line reason + condition + disposition), referencing the original invoice/SO lines; approval workflow per reason/policy.
- Postings (all reversal entries, never edits): reverse revenue & AR (or refund cash/bank), reverse COGS & stock (restock to sellable or damaged/quarantine location per disposition), reverse tax lines.
- `refund` document referencing original payment where possible (refund-to-original-method policy), `store_credit` and `credit_note` as distinct instruments with balances and expiry rules.
- Immutable audit trail (the dead `returns_audit_trail` design), reprint/void permissions, and anomaly hooks (refunds are a top fraud signal — feeds the AI anomaly detector).
- Migration note: because the live refund engine is broken, historical "returns" exist only as edited orders (`refund=1` attempts will have failed; amended orders look like smaller sales). Migration must treat edited historical orders as-is (no reconstruction of returns), and the reconciliation report must flag orders whose history changed after payment (via `track_code`/journal evidence) rather than fabricate return documents.
