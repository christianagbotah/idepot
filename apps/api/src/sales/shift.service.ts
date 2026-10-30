import { Injectable } from '@nestjs/common';
import type { CloseShift, ListDto, OpenShift, ShiftCashMovement, ShiftDto } from '@idepot/contracts';
import {
  ConflictError,
  MONEY_SCALE,
  NotFoundError,
  ValidationError,
  addScaled,
  formatMoney,
  parseMoney,
  shiftVariance,
  subScaled,
  assertShiftTransition,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
import { assertTenantRef } from '../inventory/inventory-refs.js';

/**
 * Cashier shifts (C-11 corrected): a shift-scoped session with an opening
 * float, cash paid-in/out, and a close flow that derives the EXPECTED cash
 * from the posted documents of the shift (cash tenders on payments − change
 * given, plus movements) instead of trusting counters. Variance =
 * counted − expected; a material variance close is recorded for supervisor
 * review (shift:approve) — the legacy daily sheet crossed users and was
 * only computed when a sale AND transfer existed.
 */
@Injectable()
export class ShiftService {
  constructor(private readonly uow: UnitOfWork) {}

  openShift(principal: { userId: string; tenantId: string; displayName: string }, dto: OpenShift): Promise<ShiftDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRef(ctx, 'warehouse', 'warehouse', dto.warehouseId);
      // one open shift per user at a time (a cashier cannot run two tills)
      const existing = await ctx.query<{ id: string }>(
        `SELECT id FROM cashier_shift WHERE tenant_id = $1 AND user_id = $2 AND status = 'open'`,
        [ctx.tenantId, principal.userId],
      );
      if (existing.rows.length > 0) {
        throw new ConflictError('you already have an open shift — close it before opening another');
      }
      parseMoney(dto.openingFloat);
      const code = `SH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
      const res = await ctx.query<Record<string, unknown>>(
        `INSERT INTO cashier_shift (tenant_id, code, user_id, device_id, warehouse_id, opening_float)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ctx.tenantId, code, principal.userId, dto.deviceId ?? null, dto.warehouseId, dto.openingFloat],
      );
      const id = String(res.rows[0]!.id);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'shift.opened',
        entityType: 'cashier_shift',
        entityId: id,
        details: { code, warehouseId: dto.warehouseId, openingFloat: dto.openingFloat },
      });
      await ctx.outbox.emit('ShiftOpened', { shiftId: id, code, userId: principal.userId });
      return this.loadShift(ctx, id);
    });
  }

  recordCashMovement(principal: { userId: string; tenantId: string; displayName: string }, shiftId: string, dto: ShiftCashMovement): Promise<ShiftDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const shift = await this.lockOpenShift(ctx, shiftId, principal.userId);
      parseMoney(dto.amount);
      await ctx.query(
        `INSERT INTO shift_cash_movement (tenant_id, shift_id, direction, amount, reason, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ctx.tenantId, shift.id, dto.direction, dto.amount, dto.reason, principal.userId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: `shift.cash_${dto.direction}`,
        entityType: 'cashier_shift',
        entityId: shift.id,
        details: { code: shift.code, amount: dto.amount, reason: dto.reason },
      });
      return this.loadShift(ctx, shift.id);
    });
  }

  closeShift(principal: { userId: string; tenantId: string; displayName: string }, shiftId: string, dto: CloseShift): Promise<ShiftDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const shift = await this.lockOpenShift(ctx, shiftId, principal.userId);
      assertShiftTransition('open', 'closed');
      const counted = parseMoney(dto.countedCash);
      const expected = await this.expectedCash(ctx, shift.id, parseMoney(shift.opening_float));
      const variance = shiftVariance(expected, counted);
      await ctx.query(
        `UPDATE cashier_shift
         SET status = 'closed', closed_at = now(), closed_by = $3,
             expected_cash = $4, counted_cash = $5, variance = $6, note = $7
         WHERE id = $1 AND tenant_id = $2`,
        [shift.id, ctx.tenantId, principal.userId, formatMoney(expected), dto.countedCash, formatMoney(variance), dto.note ?? null],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'shift.closed',
        entityType: 'cashier_shift',
        entityId: shift.id,
        details: {
          code: shift.code,
          expected: formatMoney(expected),
          counted: dto.countedCash,
          variance: formatMoney(variance),
          varianceApprovalRequired: variance !== 0n,
        },
      });
      await ctx.outbox.emit('ShiftClosed', {
        shiftId: shift.id,
        code: shift.code,
        expected: formatMoney(expected),
        counted: dto.countedCash,
        variance: formatMoney(variance),
      });
      return this.loadShift(ctx, shift.id);
    });
  }

  /**
   * Supervisor review of a closed shift's variance (shift:approve gate on
   * the route). The variance itself is immutable evidence — approval is an
   * audit event, not a mutation of the numbers.
   */
  approveVariance(principal: { userId: string; tenantId: string; displayName: string }, shiftId: string): Promise<ShiftDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT id, code, status, variance FROM cashier_shift WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [shiftId, ctx.tenantId],
      );
      const row = res.rows[0];
      if (!row) throw new NotFoundError('shift', shiftId);
      if (String(row.status) !== 'closed') throw new ConflictError('shift is not closed');
      const variance = row.variance != null ? parseMoney(String(row.variance)) : 0n;
      if (variance === 0n) throw new ConflictError('shift has no variance to review');
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'shift.variance_reviewed',
        entityType: 'cashier_shift',
        entityId: shiftId,
        details: { code: String(row.code), variance: formatMoney(variance) },
      });
      return this.loadShift(ctx, shiftId);
    });
  }

  async getShift(tenantId: string, shiftId: string): Promise<ShiftDto> {
    return this.uow.run({ tenantId }, (ctx) => this.loadShift(ctx, shiftId));
  }

  async listShifts(tenantId: string, opts: { openOnly?: boolean; userId?: string } = {}): Promise<ListDto<ShiftDto>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 's.tenant_id = $1';
      if (opts.openOnly) where += ` AND s.status = 'open'`;
      if (opts.userId) {
        params.push(opts.userId);
        where += ` AND s.user_id = $${params.length}`;
      }
      const res = await ctx.query<{ id: string }>(
        `SELECT s.id FROM cashier_shift s WHERE ${where} ORDER BY s.opened_at DESC LIMIT 100`,
        params,
      );
      const items: ShiftDto[] = [];
      for (const r of res.rows) items.push(await this.loadShift(ctx, r.id));
      return { items, total: items.length };
    });
  }

  /* ------------------------------ internals ------------------------------- */

  /**
   * Expected cash = opening float + Σ cash tenders (sale + counter payments)
   * − Σ change given + paid-in − paid-out. Derived from posted documents of
   * the shift — no counters to drift.
   */
  private async expectedCash(ctx: UowContext, shiftId: string, openingFloat: bigint): Promise<bigint> {
    const tenders = await ctx.query<{ cash: string; change: string }>(
      `SELECT
         COALESCE(SUM(t.amount) FILTER (WHERE t.method = 'cash'), 0)::text AS cash,
         0::text AS change
       FROM payment_tender t
       JOIN payment p ON p.id = t.payment_id
       WHERE p.tenant_id = $1 AND p.shift_id = $2`,
      [ctx.tenantId, shiftId],
    );
    const change = await ctx.query<{ change: string }>(
      `SELECT COALESCE(SUM(change_given), 0)::text AS change FROM payment
       WHERE tenant_id = $1 AND shift_id = $2`,
      [ctx.tenantId, shiftId],
    );
    const movements = await ctx.query<{ moved: string }>(
      `SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END), 0)::text AS moved
       FROM shift_cash_movement WHERE tenant_id = $1 AND shift_id = $2`,
      [ctx.tenantId, shiftId],
    );
    let expected = openingFloat;
    expected = addScaled(expected, MONEY_SCALE, parseMoney(tenders.rows[0]!.cash), MONEY_SCALE).value;
    expected = subScaled(expected, MONEY_SCALE, parseMoney(change.rows[0]!.change), MONEY_SCALE).value;
    expected = addScaled(expected, MONEY_SCALE, parseMoney(movements.rows[0]!.moved), MONEY_SCALE).value;
    return expected;
  }

  private async lockOpenShift(ctx: UowContext, shiftId: string, userId: string): Promise<{ id: string; code: string; opening_float: string }> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT id, code, user_id, status, opening_float::text AS opening_float
       FROM cashier_shift WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [shiftId, ctx.tenantId],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('shift', shiftId);
    if (String(row.status) !== 'open') throw new ConflictError('shift is closed');
    if (String(row.user_id) !== userId) {
      throw new ValidationError('only the shift owner may act on their open shift');
    }
    return { id: String(row.id), code: String(row.code), opening_float: String(row.opening_float) };
  }

  private async loadShift(ctx: UowContext, shiftId: string): Promise<ShiftDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT s.id, s.code, s.user_id, u.display_name AS user_name, s.device_id,
              s.warehouse_id, s.status, s.opening_float::text AS opening_float,
              s.opened_at, s.closed_at, s.expected_cash::text AS expected_cash,
              s.counted_cash::text AS counted_cash, s.variance::text AS variance,
              s.note, s.created_at
       FROM cashier_shift s
       LEFT JOIN app_user u ON u.id = s.user_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [shiftId, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('shift', shiftId);
    const r = res.rows[0]!;
    const movRes = await ctx.query<Record<string, unknown>>(
      `SELECT id, shift_id, direction, amount::text AS amount, reason, created_at
       FROM shift_cash_movement WHERE shift_id = $1 ORDER BY created_at, id`,
      [shiftId],
    );
    return {
      id: String(r.id),
      code: String(r.code),
      userId: String(r.user_id),
      userName: r.user_name ? String(r.user_name) : null,
      deviceId: r.device_id ? String(r.device_id) : null,
      warehouseId: String(r.warehouse_id),
      status: String(r.status) as ShiftDto['status'],
      openingFloat: String(r.opening_float),
      openedAt: new Date(r.opened_at as string).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at as string).toISOString() : null,
      expectedCash: r.expected_cash != null ? String(r.expected_cash) : null,
      countedCash: r.counted_cash != null ? String(r.counted_cash) : null,
      variance: r.variance != null ? String(r.variance) : null,
      note: r.note ? String(r.note) : null,
      movements: movRes.rows.map((m) => ({
        id: String(m.id),
        shiftId: String(m.shift_id),
        direction: String(m.direction) as 'in' | 'out',
        amount: String(m.amount),
        reason: String(m.reason),
        createdAt: new Date(m.created_at as string).toISOString(),
      })),
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }
}
