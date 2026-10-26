/**
 * Posting Coordinator / Unit of Work (ADR-0001).
 *
 * Enforcement mechanics:
 * - Application transaction context: every posting set runs inside UnitOfWork.run(),
 *   which acquires one dedicated client, BEGINs, sets transaction-scoped session
 *   context (app.tenant_id, app.user_id), executes the work, COMMITs or ROLLBACKs.
 * - AsyncLocalStorage propagation: nested services resolve the active transaction
 *   without parameter threading.
 * - Repository-layer enforcement: repositories call UnitOfWork.require(); a write
 *   attempted outside an active UoW throws NoActiveTransactionError — autocommit
 *   writes are structurally impossible.
 * - HTTP interceptors never manage transactions (logging only) — CLI/worker paths
 *   share the exact same coordinator.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, Inject } from '@nestjs/common';
import type { Pool, PoolClient, QueryResult } from 'pg';
import type { AuditEventProps } from '@idepot/domain';
import { ConflictError } from '@idepot/domain';

export const PG_POOL = 'PG_POOL';
export const PG_ADMIN_POOL = 'PG_ADMIN_POOL';

export interface UowContext {
  tenantId: string;
  userId: string | null;
  /** Execute a query on the UoW's dedicated transactional client. */
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  /** Audit participant: rows land inside the posting transaction. */
  audit: {
    record(props: AuditEventProps): Promise<void>;
  };
  /** Outbox participant: committed facts only; consumers project (never post). */
  outbox: {
    emit(type: string, payload: Record<string, unknown>): Promise<void>;
  };
}

export class NoActiveTransactionError extends Error {
  constructor() {
    super(
      'No active UnitOfWork transaction. All writes must run inside UnitOfWork.run() ' +
        '(repository-layer enforcement, ADR-0001).',
    );
    this.name = 'NoActiveTransactionError';
  }
}

interface AlsStore {
  ctx?: UowContext;
}

const als = new AsyncLocalStorage<AlsStore>();

@Injectable()
export class UnitOfWork {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** The active transaction, or undefined when none is open on this async chain. */
  static current(): UowContext | undefined {
    return als.getStore()?.ctx;
  }

  /** Repository-layer enforcement: writes REQUIRE an active UoW. */
  static require(): UowContext {
    const ctx = UnitOfWork.current();
    if (!ctx) throw new NoActiveTransactionError();
    return ctx;
  }

  /**
   * Open (or join, when already active for the same tenant) a posting transaction.
   * All-or-nothing: any throw rolls back every participant write.
   */
  async run<T>(
    opts: { tenantId: string; userId?: string | null },
    work: (ctx: UowContext) => Promise<T>,
  ): Promise<T> {
    const existing = UnitOfWork.current();
    if (existing) {
      if (existing.tenantId === opts.tenantId) {
        // propagation: nested service calls share the open transaction
        return work(existing);
      }
      throw new ConflictError(
        'cannot open a UnitOfWork for a different tenant inside an active transaction',
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', opts.tenantId]);
      if (opts.userId) {
        await client.query('SELECT set_config($1,$2,true)', ['app.user_id', opts.userId]);
      }
      const ctx = buildContext(client, opts.tenantId, opts.userId ?? null);
      let result!: T;
      await als.run({} as AlsStore, async () => {
        als.enterWith({ ctx });
        result = await work(ctx);
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* connection already broken; pool will discard */
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

function buildContext(
  client: PoolClient,
  tenantId: string,
  userId: string | null,
): UowContext {
  return {
    tenantId,
    userId,
    query: async (sql, params) => client.query(sql, params),
    audit: {
      async record(props) {
        await client.query(
          `INSERT INTO audit_event (tenant_id, actor_user_id, actor_display, action, entity_type, entity_id, details)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            props.tenantId,
            props.actorUserId,
            props.actorDisplay,
            props.action,
            props.entityType,
            props.entityId,
            JSON.stringify(props.details),
          ],
        );
      },
    },
    outbox: {
      async emit(type, payload) {
        await client.query(
          `INSERT INTO outbox_event (tenant_id, type, payload) VALUES ($1,$2,$3)`,
          [tenantId, type, JSON.stringify(payload)],
        );
      },
    },
  };
}
