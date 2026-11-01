import { Injectable } from '@nestjs/common';
import type { StockCountDto } from '@idepot/contracts';
import { validateNonNegativeQuantity } from '@idepot/domain';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
 
import type { PrincipalLike } from './stock-count.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockCountService } from './stock-count.service.js';

export interface OpeningStockInput {
  warehouseId: string;
  lines: Array<{ productId: string; quantityBase: string; unitCost?: string | null }>;
  /** count-first authority per strategy doc §4; legacy_quantity requires risk acceptance */
  authority: 'physical_count' | 'legacy_quantity' | 'system_entry';
  acceptedMigrationRisk?: boolean;
  sourceEvidence?: string | null;
  note?: string | null;
}

/**
 * Opening-stock entry for the new system. Follows the locked count-first
 * policy: the physical count is the default authority; legacy-quantity
 * authority is ONLY accepted with acceptedMigrationRisk=true and requires
 * the stockcount:approve permission (owner/accountant sign-off semantics) —
 * the system never pretends legacy stock is verified truth.
 *
 * One transaction: approved count document (authority + evidence + risk
 * flags) + variance adjustment ('receipt' movements, reason opening_balance)
 * + balances + audit + outbox.
 */
@Injectable()
export class OpeningStockService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly counts: StockCountService,
  ) {}

  async createOpeningStock(principal: PrincipalLike, input: OpeningStockInput): Promise<StockCountDto> {
    for (const line of input.lines) validateNonNegativeQuantity(line.quantityBase);
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      // 1. count document with the physical/legacy authority + risk flags
      //    (StockCountService.create enforces the legacy-quantity risk + permission gates)
      const count = await this.counts.create(principal, {
        warehouseId: input.warehouseId,
        note: input.note ?? null,
        authority: input.authority,
        acceptedMigrationRisk: input.acceptedMigrationRisk ?? false,
        sourceEvidence: input.sourceEvidence ?? null,
        lines: input.lines.map((l) => ({ productId: l.productId, countedQuantityBase: l.quantityBase })),
      });

      // 2. submit (counted) with the migration/count actor
      await ctx.query(`UPDATE stock_count SET status='counted', counted_by=$2, counted_at=now() WHERE id=$1`, [
        count.id,
        input.authority === 'physical_count' ? 'physical count' : input.authority,
      ]);

      // 3. approve with receipt-type movements (reason opening_balance);
      //    system balances are 0 pre-opening, so variances == the opening quantities.
      //    Lines carrying a unitCost seed the AVCO cost layers (ADR-0004);
      //    lines without one open as zero-value layers (cost basis may be
      //    back-filled by a later counted receipt — migration sign-off).
      return this.counts.approveWithinCtx(ctx, principal, count.id, {
        movementType: 'receipt',
        movementReason: 'opening_balance',
        adjustmentReason: `opening stock entry (authority: ${input.authority}${input.acceptedMigrationRisk ? ', accepted migration risk' : ''})`,
        note: input.note ?? null,
        costByProduct: new Map(
          input.lines
            .filter((l) => l.unitCost != null && l.unitCost !== '')
            .map((l) => [l.productId, l.unitCost as string]),
        ),
      });
    });
  }
}

