#!/usr/bin/env python3
"""Generate the 66-table register section for
docs/migration/legacy-schema-verification-2026-11-06.md.

Combines: the new intake DDL (table list), the Phase 0 table-business-map
verdicts, the legacy-to-postgres-map targets, and the verified migration
engine coverage (FIXTURE_TABLES specs + transform code references).
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DDL = REPO / "legacy/intake/2026-11-06/depot_schema_only_sanitized.sql"

# engine coverage verified 2026-11-09 from packages/migration/src/types.ts
# (FIXTURE_TABLES) + transform-phase2..5 code references.
STAGED = {
    'item', 'invoice', 'payment', 'sales_order', 'payment_with_goods',
    'proforma_invoice', 'proforma_invoice_order', 'cash_deposit_disbursement',
    'invoice_code', 'waybill_code', 'item_main_category', 'item_category',
    'units', 'units_items', 'customers', 'suppliers', 'purchase_order',
    'accounts_payable', 'accounts', 'general_journal',
}
PHASE5_VERIFY = {
    'return_reasons', 'sales_returns', 'sales_return_items',
    'refund_transactions', 'store_credits', 'returns_audit_trail',
}

# (classification, target, coverage) per legacy table.
# classification: live | historical-reference-only | dead-unused | ambiguous
# coverage: staged+transformed | staged+verify-only(0020) | mapped-not-implemented |
#           by-design-not-migrated
ROWS = {
    'account_type': ('live', 'enum values folded into the CoA account model (map §1)', 'mapped-not-implemented'),
    'accounts': ('live', 'account (CoA) + banking master + tender method mapping', 'staged+transformed'),
    'accounts_payable': ('live', 'supplier_invoice / outstanding_debt + allocations', 'staged+transformed'),
    'accounts_used': ('ambiguous', 'none (dead writer, read by receipt_pos only)', 'by-design-not-migrated'),
    'admin': ('live', 'app_user + user_role seed (map §1)', 'mapped-not-implemented'),
    'attendance': ('live', 'optional shift/attendance history import', 'mapped-not-implemented'),
    'audit_log': ('dead-unused', 'none (never written; new audit_event is the successor)', 'by-design-not-migrated'),
    'balance_sheet': ('dead-unused', 'none (report computed on the fly)', 'by-design-not-migrated'),
    'cash_deposit_disbursement': ('live', 'credit_application rows', 'staged+transformed'),
    'ci_sessions': ('dead-unused', 'none (framework sessions)', 'by-design-not-migrated'),
    'creditors': ('historical-reference-only', 'kept in legacy_raw for audit only (FROZEN writer)', 'by-design-not-migrated'),
    'customers': ('live', 'customer (+ opening-balance docs)', 'staged+transformed'),
    'customer_loyalty': ('dead-unused', 'none (dead DDL; new loyalty foundation is feature-flagged OFF)', 'by-design-not-migrated'),
    'customer_rewards': ('dead-unused', 'none (dead DDL)', 'by-design-not-migrated'),
    'customer_segments': ('dead-unused', 'none (dead DDL)', 'by-design-not-migrated'),
    'customer_tiers': ('dead-unused', 'none (dead DDL)', 'by-design-not-migrated'),
    'debtors': ('historical-reference-only', 'kept in legacy_raw for audit only (FROZEN writer)', 'by-design-not-migrated'),
    'general_journal': ('live', 'journal reference-only import (D8/D9) + opening TB evidence', 'staged+transformed'),
    'invoice': ('live', 'invoice + lines (+ Opening-balance/Deposit classifications)', 'staged+transformed'),
    'invoice_code': ('live', 'document_sequence booklet import', 'staged+transformed'),
    'items': ('live', 'product + product_unit + opening stock count', 'staged+transformed'),
    'items_in_units_order': ('live', 'unit-sale line evidence; folded into order lines', 'mapped-not-implemented'),
    'items_prices': ('live', 'price_list_item (customer-specific package prices)', 'mapped-not-implemented'),
    'items_transfers': ('live', 'transfer_order with receiver evidence', 'mapped-not-implemented'),
    'items_units_prices': ('live', 'price_list_item per unit (dedupe on latest)', 'mapped-not-implemented'),
    'item_category': ('live', 'product_category (child)', 'staged+transformed'),
    'item_locations': ('dead-unused', 'none (dead DDL, multi-shop design)', 'by-design-not-migrated'),
    'item_main_category': ('live', 'product_category (parent)', 'staged+transformed'),
    'kpi_snapshots': ('dead-unused', 'none (dead DDL; new kpi_snapshot is the successor)', 'by-design-not-migrated'),
    'language': ('dead-unused', 'none (school i18n)', 'by-design-not-migrated'),
    'loyalty_points': ('dead-unused', 'none (dead DDL)', 'by-design-not-migrated'),
    'loyalty_settings': ('dead-unused', 'none (dead DDL; never read by live code)', 'by-design-not-migrated'),
    'loyalty_transactions': ('dead-unused', 'none (dead DDL)', 'by-design-not-migrated'),
    'message': ('dead-unused', 'none (school messaging)', 'by-design-not-migrated'),
    'noticeboard': ('dead-unused', 'none (school notices)', 'by-design-not-migrated'),
    'outstanding_debts': ('live', 'outstanding_debt documents (allocated account)', 'mapped-not-implemented'),
    'packages': ('live', 'folded into unit (package types)', 'mapped-not-implemented'),
    'payment': ('live', 'payment + payment_tender (+ dedupe D2 handling)', 'staged+transformed'),
    'payment_with_goods': ('live', 'mirror verified per so_code; orders imported from sales_order', 'staged+transformed'),
    'permissions': ('dead-unused', 'none (dead DDL; new RBAC catalog is the successor)', 'by-design-not-migrated'),
    'prices': ('dead-unused', 'none (school-era item1..28 matrix)', 'by-design-not-migrated'),
    'proforma_invoice': ('live', 'quotation headers', 'staged+transformed'),
    'proforma_invoice_order': ('live', 'quotation lines', 'staged+transformed'),
    'purchase_order': ('live', 'purchase_order + lines + collapsed GRN/invoice (legacy semantics)', 'staged+transformed'),
    'refund_transactions': ('dead-unused', 'none (dead DDL; new refund engine is the successor)', 'staged+verify-only(0020)'),
    'returns_audit_trail': ('dead-unused', 'none (dead DDL; new audit_event is the successor)', 'staged+verify-only(0020)'),
    'return_reasons': ('dead-unused', 'none (dead DDL; seeded new return_reason policy instead)', 'staged+verify-only(0020)'),
    'roles': ('dead-unused', 'none (dead DDL; new roles in RBAC catalog)', 'by-design-not-migrated'),
    'role_permissions': ('dead-unused', 'none (dead DDL)', 'by-design-not-migrated'),
    'sales_order': ('live', 'sales_order + lines + invoice + receipts + open-SO carryover', 'staged+transformed'),
    'sales_returns': ('dead-unused', 'none (dead DDL; new return_order is the successor)', 'staged+verify-only(0020)'),
    'sales_return_items': ('dead-unused', 'none (dead DDL; new return_order_line is the successor)', 'staged+verify-only(0020)'),
    'sales_targets': ('dead-unused', 'none (dead DDL; new kpi_target is the successor)', 'by-design-not-migrated'),
    'settings': ('live', 'tenant/sequence config; SMS creds → vault (never Git)', 'mapped-not-implemented'),
    'shelves': ('dead-unused', 'none (dead DDL)', 'by-design-not-migrated'),
    'shops': ('dead-unused', 'none (dead DDL — multi-branch is target-only)', 'by-design-not-migrated'),
    'shop_attendants': ('dead-unused', 'none (dead DDL)', 'by-design-not-migrated'),
    'stock_manager': ('live', 'informs the opening-stock count baseline (never a rebuild source)', 'mapped-not-implemented'),
    'stock_record': ('ambiguous', 'not migrated (purchase-side partial ledger; q_sold never written)', 'by-design-not-migrated'),
    'store_credits': ('dead-unused', 'none (dead DDL; new store_credit instrument is the successor)', 'staged+verify-only(0020)'),
    'suppliers': ('live', 'supplier (+ opening-balance docs)', 'staged+transformed'),
    'units': ('live', 'unit', 'staged+transformed'),
    'units_items': ('live', 'product_unit (conversion factor + default unit price)', 'staged+transformed'),
    'unit_transfer': ('live', 'folded into the opening stock count (base units)', 'mapped-not-implemented'),
    'visitor_tracker': ('dead-unused', 'none (page-view tracker)', 'by-design-not-migrated'),
    'waybill_code': ('live', 'document_sequence booklet import (waybill)', 'staged+transformed'),
}

def main():
    tables = sorted(set(re.findall(r"CREATE TABLE `(\w+)`", DDL.read_text())))
    assert len(tables) == 66, f"expected 66 tables, got {len(tables)}"
    assert set(tables) == set(ROWS), (
        f"register mismatch: missing={set(tables)-set(ROWS)} extra={set(ROWS)-set(tables)}")
    lines = ["| Legacy table | Classification | Target (docs/migration/legacy-to-postgres-map.md) | Engine coverage |",
             "|---|---|---|---|"]
    from collections import Counter
    cls = Counter()
    cov = Counter()
    for t in tables:
        c, target, coverage = ROWS[t]
        cls[c] += 1
        cov[coverage] += 1
        lines.append(f"| `{t}` | {c} | {target} | {coverage} |")
    out = Path('/tmp/table-register.md')
    out.write_text("\n".join(lines) + "\n")
    print(f"register rows: {len(tables)}")
    print("classification:", dict(cls))
    print("coverage:", dict(cov))
    print(f"written -> {out}")

if __name__ == "__main__":
    main()
