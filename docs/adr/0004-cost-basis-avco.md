# ADR-0004: Cost basis — weighted-average (AVCO) with effective-dated policy versions

- **Status**: Accepted (Phase 3 hardening round — independent code review finding #3)
- **Date**: 2026-10-31
- **Context**: Phase 3 Sales & POS independent review; supersedes the Phase 0
  deferred decision "cost basis = effective-dated/configurable + migration
  sign-off" referenced by ROADMAP Phase 1 gate and target-architecture §5.
- **Deciders**: repo owner (via review), agent (Z.ai)

## Context

Phase 3 shipped `invoice_line.cost_at_sale` as a **purchase-price snapshot**
with the cost basis explicitly deferred to the Phase 4 posting engine. The
independent review rejected that deferral for correctness reasons:

1. A purchase-price snapshot is not a defensible COGS basis when the same
   product is bought at different prices over time — margins silently drift
   from reality, and nothing in the schema recorded WHICH basis produced a
   historical figure.
2. COGS evidence must be **transaction-time and immutable** exactly like tax
   evidence: a later accounting-policy change must never rewrite what a
   committed sale cost.
3. The legacy system's stock margin reports already assumed something
   average-like; the migration cannot reconcile against an undefined basis.

## Decision

1. **The default and only implemented cost method in Phase 3 is AVCO**
   (weighted average cost per `(tenant, warehouse, product)`), with the
   averaging state maintained **inside the StockPoster's locked critical
   section** (the same per-tenant advisory lock + deterministic row locks
   that protect `stock_balance`).
2. **The cost basis is an effective-dated, versioned tenant policy**
   (`cost_policy_version`, migration 0007). The method is stored on the
   version row, never editable in place; a method change requires a new
   effective-dated version **and accounting/migration sign-off** (same
   principle as tax profile versions). Phase 3 accepts only `'avco'`; the
   CHECK constraint and the resolver reject anything else loudly.
3. **Every stock movement row carries transaction-time cost evidence**
   (`unit_cost`, `cost_value`):
   - receipts add a layer valued `round4(qty × unit_cost)` — rounded ONCE;
   - issues remove value **proportionally to on-hand value**:
     `cost_value = round4(|qty| × total_value / on_hand_qty)` — the average
     is carried exactly, full depletion empties the value precisely, and the
     sub-cent rounding residue of partial issues stays in inventory;
   - an issue beyond the tracked layers (backorder or un-costed opening
     stock) carries **no** cost — the ledger records the fact, not an
     invented number;
   - **reversals copy the original movement's evidence verbatim**, so stock
     and value restore exactly;
   - **transfers carry the dispatched AVCO value**: a partial receive takes
     its proportional share `round4(remaining_value × qty / remaining_qty)`
     and the completing receive takes the exact residual, so
     `Σ transfer-in values == transfer-out value` for ANY sequence of
     partial receives.
4. **`stock_cost_state`** (`quantity_base`, `total_value` per
   tenant/warehouse/product) is a rebuildable projection maintained by the
   poster and recomputed by the balance-rebuild job from the ledger's cost
   evidence — the same ledger-wins contract as `stock_balance`.
5. **`invoice_line` stores the resolution evidence** (`cost_method`,
   `cost_policy_version_id`, `cogs`, plus the AVCO `cost_at_sale` unit cost):
   a committed sale can always answer "what basis, which policy version,
   what unit cost, what line COGS".
6. **Zero-value layers are legal**: opening stock or receipts without a unit
   cost add quantity without value (free goods, or cost basis pending
   migration sign-off); sales of such stock carry no COGS. The
   `stock_cost_state.total_value >= 0` CHECK makes value smuggling downward
   structurally impossible.

## Alternatives considered

- **FIFO/LIFO layer picking**: the legacy data cannot reconstruct a
  reliable receipt sequence (dates stored as longtext, purchases partially
  quarantined), so a serialized-layer method would manufacture precision the
  evidence does not support. Deferred: a future cost-policy version MAY add
  it where a tenant's data justifies it (the versioned-policy mechanism is
  the extension point).
- **Standard cost**: requires a cost-maintenance discipline the depot
  operating model does not have.
- **Purchase-price snapshot (status quo)**: rejected by review — see above.

## Consequences

- COGS is exact-decimal and deterministic; the AVCO walk is provable from
  the append-only ledger alone (integration test: rebuild reproduces the
  state bit-for-bit).
- Migration must decide the opening-layer value policy (count-first
  quantities are already locked; the value basis for imported opening stock
  is part of the Phase 8 cutover sign-off). Until then, imported stock may
  open as zero-value layers.
- The Phase 4 posting engine inherits: chart-of-accounts mapping for
  inventory/COGS (now seeded), journal lines for non-sale inventory
  documents (adjustments/transfers/opening balances), and back-fill of GL
  for pre-hardening Phase 3 documents (identifiable by
  `cost_method IS NULL AND cogs IS NULL` with a purchase-price
  `cost_at_sale`).
