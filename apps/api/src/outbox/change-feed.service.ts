import { Injectable, ValidationError as NestValidationError } from '@nestjs/common';
import { UnitOfWork } from '../db/unit-of-work.js';
import type { Principal } from '../auth/jwt-auth.guard.js';

export interface ChangeFeedEntry {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  status: string;
}

@Injectable()
export class ChangeFeedService {
  constructor(private readonly uow: UnitOfWork) {}

  list(principal: Principal, after: string | undefined, limit: number) {
    return this.uow.run({ tenantId: principal.tenantId }, async (ctx) => {
      const params: unknown[] = [limit];
      let sql = `SELECT id, type, payload, occurred_at, status FROM outbox_event`;
      if (after) {
        if (!/^[0-9a-f-]{36}$/i.test(after)) {
          throw new NestValidationError('after must be a uuid');
        }
        sql += ` WHERE (occurred_at, id) > (SELECT occurred_at, id FROM outbox_event WHERE id = $2)`;
        params.push(after);
      }
      sql += ` ORDER BY occurred_at, id LIMIT $1`;
      const res = await ctx.query(sql, params);
      return {
        items: res.rows.map((r) => ({
          id: String(r.id),
          type: String(r.type),
          payload: r.payload as Record<string, unknown>,
          occurredAt: new Date(r.occurred_at as string).toISOString(),
          status: String(r.status),
        })),
      };
    });
  }

  ack(principal: Principal, dto: { ids: string[] }) {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const res = await ctx.query<{ id: string }>(
        `UPDATE outbox_event SET status='processed', processed_at=now()
         WHERE id = ANY($1::uuid[]) AND tenant_id = $2 RETURNING id`,
        [dto.ids, principal.tenantId],
      );
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'change_feed.acked',
        entityType: 'outbox_event',
        entityId: null,
        details: { acked: res.rows.map((r) => r.id) },
      });
      return { acked: res.rows.map((r) => r.id) };
    });
  }
}
