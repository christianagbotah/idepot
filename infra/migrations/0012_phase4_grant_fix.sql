-- ============================================================
-- 0012_phase4_grant_fix.sql — corrective grant (additive).
--
-- goods_receipt_line carries the invoiced_quantity_base counter that
-- the supplier-invoice posting maintains, and its over-billing guard
-- row-locks the line (SELECT ... FOR UPDATE requires the UPDATE
-- privilege in PostgreSQL). The header stays insert-only; the service
-- never edits received quantities or costs (append-only document
-- semantics are enforced above the DB).
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON goods_receipt_line TO idepot_app;

-- supplier_payment rows are locked (SELECT ... FOR UPDATE) by the
-- advance-application flow; allocations remain insert-only and the
-- payment amount is never mutated (conservation is DB-guarded).
GRANT SELECT, INSERT, UPDATE ON supplier_payment TO idepot_app;
