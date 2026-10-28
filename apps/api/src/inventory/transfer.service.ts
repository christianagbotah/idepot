import { Injectable } from '@nestjs/common';
import type {
  CreateTransfer,
  ReceiveTransfer,
  StockMovementDto,
  TransferDto,
} from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  assertTransferTransition,
  parseQuantity,
  validateMovementQuantity,
} from '@idepot/domain';
 
import type { UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockPoster } from './stock-poster.js';

export interface PrincipalLike {
  userId: string;
  tenantId: string;
  displayName: string;
  roles?: string[];
}

function newCode(): string {
  return `TR-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0')}`;
}

/**
 * Transfers between warehouses with an auditable in-transit state.
 * dispatch: one transaction = status flip + transfer_out movements at the
 * source + balance updates + audit + outbox. receive (full or partial, as
 * many times as needed): transfer_in movements at the destination; the
 * received total can never exceed the dispatched quantity, and the transfer
 * completes only when every line is fully received — quantity can never
 * silently disappear between the two locations.
 */
@Injectable()
export class TransferService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly poster: StockPoster,
  ) {}

  create(principal: PrincipalLike, dto: CreateTransfer): Promise<TransferDto> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new ConflictError('transfer source and destination must differ');
    }
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      for (const line of dto.lines) validateMovementQuantity(line.quantityBase);
      const code = dto.code ?? newCode();
      const res = await ctx.query<{ id: string }>(
        `INSERT INTO transfer (tenant_id, code, from_warehouse_id, to_warehouse_id, note)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [ctx.tenantId, code, dto.fromWarehouseId, dto.toWarehouseId, dto.note ?? null],
      );
      const id = res.rows[0]!.id;
      for (const line of dto.lines) {
        await ctx.query(
          `INSERT INTO transfer_line (tenant_id, transfer_id, product_id, quantity_base)
           VALUES ($1,$2,$3,$4)`,
          [ctx.tenantId, id, line.productId, line.quantityBase],
        );
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'transfer.created',
        entityType: 'transfer',
        entityId: id,
        details: { code, from: dto.fromWarehouseId, to: dto.toWarehouseId, lines: dto.lines.length },
      });
      await ctx.outbox.emit('TransferCreated', { transferId: id, code });
      return (await this.getWithinCtx(ctx, id))!;
    });
  }

  dispatch(principal: PrincipalLike, id: string): Promise<TransferDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const t = await this.lockTransfer(ctx, id);
      if (!t) throw new NotFoundError('transfer', id);
      assertTransferTransition(t.status as TransferDto['status'], 'in_transit');

      const lines = await ctx.query<{ product_id: string; quantity_base: string }>(
        `SELECT product_id, quantity_base FROM transfer_line WHERE transfer_id = $1 ORDER BY product_id`,
        [id],
      );
      const movements: StockMovementDto[] = await this.poster.post(
        ctx,
        lines.rows.map((l) => ({
          warehouseId: String(t.from_warehouse_id),
          productId: l.product_id,
          movementType: 'transfer_out' as const,
          quantityBase: `-${l.quantity_base}`,
          transferId: id,
          reason: 'transfer dispatch',
        })),
        { sourceDocumentType: 'transfer', sourceDocumentId: id, createdBy: principal.userId },
      );

      await ctx.query(
        `UPDATE transfer SET status='in_transit', dispatched_at=now(), dispatched_by=$2 WHERE id=$1`,
        [id, principal.userId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'transfer.dispatched',
        entityType: 'transfer',
        entityId: id,
        details: { code: String(t.code), movements: movements.length },
      });
      await ctx.outbox.emit('TransferDispatched', {
        transferId: id,
        code: String(t.code),
        movementIds: movements.map((m) => m.id),
      });
      return (await this.getWithinCtx(ctx, id))!;
    });
  }

  receive(principal: PrincipalLike, id: string, dto: ReceiveTransfer): Promise<TransferDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const t = await this.lockTransfer(ctx, id);
      if (!t) throw new NotFoundError('transfer', id);
      assertTransferTransition(t.status as TransferDto['status'], 'received');

      const lines = await ctx.query<Record<string, unknown>>(
        `SELECT product_id, quantity_base, received_quantity_base
         FROM transfer_line WHERE transfer_id = $1 ORDER BY product_id FOR UPDATE`,
        [id],
      );
      const byProduct = new Map(lines.rows.map((r) => [String(r.product_id), r]));

      const movements: StockMovementDto[] = [];
      for (const line of dto.lines) {
        const tl = byProduct.get(line.productId);
        if (!tl) {
          throw new ConflictError(`product ${line.productId} is not on transfer ${id}`);
        }
        const dispatched = parseQuantity(String(tl.quantity_base));
        const received = parseQuantity(String(tl.received_quantity_base));
        const qty = validateMovementQuantity(line.quantityBase);
        if (received + qty > dispatched) {
          throw new ConflictError(
            `cannot receive ${line.quantityBase} of product ${line.productId}: dispatched ${dispatched}, already received ${received}`,
          );
        }
        const posted = await this.poster.post(
          ctx,
          [
            {
              warehouseId: String(t.to_warehouse_id),
              productId: line.productId,
              movementType: 'transfer_in' as const,
              quantityBase: line.quantityBase,
              transferId: id,
              reason: 'transfer receipt',
            },
          ],
          { sourceDocumentType: 'transfer', sourceDocumentId: id, createdBy: principal.userId },
        );
        movements.push(...posted);
        await ctx.query(
          `UPDATE transfer_line SET received_quantity_base = received_quantity_base + $3
           WHERE transfer_id = $1 AND product_id = $2`,
          [id, line.productId, line.quantityBase],
        );
      }

      const remaining = await ctx.query<{ n: string }>(
        `SELECT count(*)::text n FROM transfer_line
         WHERE transfer_id = $1 AND received_quantity_base < quantity_base`,
        [id],
      );
      const complete = Number(remaining.rows[0]!.n) === 0;
      if (complete) {
        await ctx.query(
          `UPDATE transfer SET status='received', received_at=now(), received_by=$2 WHERE id=$1`,
          [id, principal.userId],
        );
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'transfer.received',
        entityType: 'transfer',
        entityId: id,
        details: { code: String(t.code), lines: dto.lines.length, complete },
      });
      await ctx.outbox.emit('TransferReceived', { transferId: id, code: String(t.code), complete });

      // test hook (Phase 1 precedent): inject failure AFTER all participant
      // writes to prove the whole set rolls back — zero partial state
      if (dto.simulateFailureAfterWrites) {
        throw new Error('simulated failure after transfer receipt writes');
      }
      return (await this.getWithinCtx(ctx, id))!;
    });
  }

  list(principal: { tenantId: string }) {
    return this.uow.run({ tenantId: principal.tenantId }, async (ctx) => {
      const res = await ctx.query<{ id: string }>(
        `SELECT id FROM transfer ORDER BY created_at DESC LIMIT 200`,
      );
      const out: TransferDto[] = [];
      for (const r of res.rows) out.push((await this.getWithinCtx(ctx, String(r.id)))!);
      return out;
    });
  }

  get(principal: { tenantId: string }, id: string): Promise<TransferDto> {
    return this.uow.run({ tenantId: principal.tenantId }, async (ctx) => {
      const dto = await this.getWithinCtx(ctx, id);
      if (!dto) throw new NotFoundError('transfer', id);
      return dto;
    });
  }

  private async lockTransfer(ctx: UowContext, id: string): Promise<Record<string, unknown> | undefined> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT id, code, from_warehouse_id, to_warehouse_id, status, dispatched_at, dispatched_by,
              received_at, received_by, note, created_at
       FROM transfer WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return res.rows[0];
  }

  private async getWithinCtx(ctx: UowContext, id: string): Promise<TransferDto | undefined> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT id, code, from_warehouse_id, to_warehouse_id, status, dispatched_at, dispatched_by,
              received_at, received_by, note, created_at
       FROM transfer WHERE id = $1`,
      [id],
    );
    const h = res.rows[0];
    if (!h) return undefined;
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT id, product_id, quantity_base, received_quantity_base
       FROM transfer_line WHERE transfer_id = $1 ORDER BY product_id`,
      [id],
    );
    return {
      id: String(h.id),
      code: String(h.code),
      fromWarehouseId: String(h.from_warehouse_id),
      toWarehouseId: String(h.to_warehouse_id),
      status: String(h.status) as TransferDto['status'],
      dispatchedAt: h.dispatched_at ? new Date(h.dispatched_at as string).toISOString() : null,
      dispatchedBy: h.dispatched_by ? String(h.dispatched_by) : null,
      receivedAt: h.received_at ? new Date(h.received_at as string).toISOString() : null,
      receivedBy: h.received_by ? String(h.received_by) : null,
      note: h.note ? String(h.note) : null,
      lines: lines.rows.map((l) => ({
        id: String(l.id),
        productId: String(l.product_id),
        quantityBase: String(l.quantity_base),
        receivedQuantityBase: String(l.received_quantity_base),
      })),
      createdAt: new Date(h.created_at as string).toISOString(),
    };
  }
}
