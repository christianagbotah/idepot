import { Injectable } from '@nestjs/common';
import type {
  CreateDeposit,
  ReceivePayment,
  SyncEventOutcome,
  SyncPullResponseDto,
  SyncPush,
} from '@idepot/contracts';
import { ConflictError, DomainError, ValidationError } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';

import type { SalePrincipal } from './sale-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { SalePoster, type SaleInput } from './sale-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { PaymentService } from './payment.service.js';

/** Domain errors that map to a sync CONFLICT (review queue) vs REJECTED. */
function conflictCodes(err: unknown): string | null {
  if (err instanceof ConflictError) {
    if (/insufficient stock/.test(err.message)) return 'stock_oversold';
    if (/stale conversion/.test(err.message)) return 'stale_conversion';
    if (/credit/.test(err.message)) return 'credit_limit';
    return 'business_conflict';
  }
  return null;
}

interface SyncPrincipal extends SalePrincipal {
  deviceId: string;
}

/**
 * Offline sync engine, server half (offline-sync §4):
 *
 * PUSH — each event is applied in EXACTLY ONE PG transaction through the
 * same posting coordinator as online commands (SalePoster / PaymentService).
 * The `sync_applied_event` registry row is written INSIDE that transaction:
 *  - kill mid-push → everything rolls back, nothing applied, retry safe;
 *  - duplicate delivery (same eventId or idempotencyKey) → the stored
 *    response is returned as `duplicate` with the ORIGINAL result — the
 *    device converges, the ledger never sees a second document;
 *  - business conflicts (oversold stock, credit) per tenant policy →
 *    `conflict` outcome with a code; the event is recorded as conflicted
 *    and the device raises a review task — never a silent resolution.
 *
 * PULL — resumable change feed (seq > cursor) for the device replica.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly salePoster: SalePoster,
    private readonly payments: PaymentService,
  ) {}

  async push(principal: SalePrincipal, dto: SyncPush): Promise<{ outcomes: SyncEventOutcome[]; serverTime: string }> {
    const p: SyncPrincipal = { ...principal, deviceId: dto.deviceId };
    const outcomes: SyncEventOutcome[] = [];
    for (const event of dto.events) {
      outcomes.push(await this.applyEvent(p, event));
    }
    return { outcomes, serverTime: new Date().toISOString() };
  }

  private async applyEvent(
    p: SyncPrincipal,
    event: SyncPush['events'][number],
  ): Promise<SyncEventOutcome> {
    // 1. idempotency pre-check (fast path; the authoritative guarantee is
    //    the registry INSERT inside the apply transaction below)
    const seen = await this.uow.run({ tenantId: p.tenantId }, async (ctx) => {
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT outcome, response FROM sync_applied_event
         WHERE event_id = $1 OR (tenant_id = $2 AND idempotency_key = $3)
         LIMIT 1`,
        [event.eventId, ctx.tenantId, event.idempotencyKey],
      );
      return res.rows[0] ?? null;
    });
    if (seen) {
      return {
        eventId: event.eventId,
        status: 'duplicate',
        result: (seen.response ?? {}) as Record<string, unknown>,
      };
    }

    // 2. apply inside one transaction; register the result atomically
    try {
      const result = await this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
        let applied: Record<string, unknown>;
        switch (event.type) {
          case 'sale.create': {
            const input = event.payload as SaleInput;
            input.source = 'sync';
            input.deviceId = p.deviceId;
            const posted = await this.salePoster.postSale(ctx, p, input);
            applied = { invoiceId: posted.invoice.id, code: posted.invoice.code, backorder: posted.backorder };
            break;
          }
          case 'payment.receive': {
            const payment = await this.payments.receivePaymentWithinCtx(ctx, p, event.payload as ReceivePayment);
            applied = { paymentId: payment.id, code: payment.code };
            break;
          }
          case 'deposit.create': {
            const deposit = await this.payments.createDeposit(p, event.payload as CreateDeposit);
            applied = { depositId: deposit.id, code: deposit.code };
            break;
          }
          case 'customer.create': {
            // reference data created offline: syncs as a create; dedupe by
            // phone happens at the party layer (offline-sync §5 policies)
            throw new ValidationError('customer.create sync is handled by the parties module — not accepted here in Phase 3');
          }
          default:
            throw new ValidationError(`unknown sync event type`);
        }
        await ctx.query(
          `INSERT INTO sync_applied_event
             (event_id, tenant_id, device_id, idempotency_key, event_type, outcome, response, occurred_at)
           VALUES ($1,$2,$3,$4,$5,'applied',$6,$7)`,
          [event.eventId, ctx.tenantId, p.deviceId, event.idempotencyKey, event.type, JSON.stringify(applied), event.occurredAt ?? null],
        );
        return applied;
      });
      return { eventId: event.eventId, status: 'applied', result };
    } catch (err) {
      const code = conflictCodes(err);
      const message = err instanceof Error ? err.message : 'sync apply failed';
      if (code) {
        // CONFLICT (business outcome: oversold stock, stale config, credit) is
        // recorded — a naive device retry gets `duplicate`, never a delayed
        // second application of a business-conflicting sale. The accountant/
        // supervisor resolves it from the review queue (offline-sync §5b).
        await this.uow.run({ tenantId: p.tenantId }, async (ctx) => {
          await ctx.query(
            `INSERT INTO sync_applied_event
               (event_id, tenant_id, device_id, idempotency_key, event_type, outcome, response, occurred_at)
             VALUES ($1,$2,$3,$4,$5,'conflict',$6,$7)
             ON CONFLICT (event_id) DO NOTHING`,
            [
              event.eventId, ctx.tenantId, p.deviceId, event.idempotencyKey, event.type,
              JSON.stringify({ code, message }), event.occurredAt ?? null,
            ],
          );
        });
        return { eventId: event.eventId, status: 'conflict', code, message };
      }
      // REJECTED (validation/internal): the transaction rolled back to zero
      // state and nothing was recorded — the device may correct and retry
      // the SAME event (crash-safety contract).
      return {
        eventId: event.eventId,
        status: 'rejected',
        code: err instanceof DomainError ? err.code : 'error',
        message,
      };
    }
  }

  /** Resumable pull: committed-fact stream after the device cursor.
   *  Reads the transactional outbox directly (Phase 1 primitive) — the
   *  dedicated change_feed projection with per-tenant seq arrives with the
   *  first relay consumer; the cursor protocol is already resumable. */
  async pull(tenantId: string, opts: { cursor?: string; limit?: number }): Promise<SyncPullResponseDto> {
    const limit = Math.min(opts.limit ?? 200, 1000);
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [limit + 1];
      let sql = `SELECT id, type, payload, occurred_at, status FROM outbox_event`;
      if (opts.cursor) {
        sql += ` WHERE (occurred_at, id) > (SELECT occurred_at, id FROM outbox_event WHERE id = $2)`;
        params.push(opts.cursor);
      }
      sql += ` ORDER BY occurred_at, id LIMIT $1`;
      const res = await ctx.query<Record<string, unknown>>(sql, params);
      const hasMore = res.rows.length > limit;
      const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
      return {
        entries: rows.map((r) => ({
          id: String(r.id),
          type: String(r.type),
          payload: r.payload as Record<string, unknown>,
          occurredAt: new Date(r.occurred_at as string).toISOString(),
          status: String(r.status),
        })),
        cursor: rows.length > 0 ? String(rows[rows.length - 1]!.id) : (opts.cursor ?? null),
        hasMore,
      };
    });
  }
}
