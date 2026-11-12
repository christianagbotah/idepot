import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  CreateDeposit,
  ReceivePayment,
  SyncEventOutcome,
  SyncPullResponseDto,
  SyncPush,
} from '@idepot/contracts';
import { ConflictError, DomainError, ValidationError, syncEventFingerprint } from '@idepot/domain';

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
    if (/stale price/.test(err.message)) return 'stale_price';
    if (/materiality threshold/.test(err.message)) return 'override_requires_approval';
    if (/credit/.test(err.message)) return 'credit_limit';
    if (/no server source applies/.test(err.message)) return 'tax_exemption_unbacked';
    return 'business_conflict';
  }
  return null;
}

/** Advisory-lock key derivation (repo-wide idiom, see StockPoster): a
 * deterministic 64-bit hash of the domain string. md5 is a documented,
 * version-stable function; hash-named internals like hashtext_extended
 * were renamed across major PostgreSQL releases. */
const ADVISORY_KEY_SQL = `('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint`;

/** Claims the idempotency domain of one sync event inside the CALLER'S
 * transaction: transaction-scoped advisory locks over BOTH registry
 * identities — the event id (PK) and the (tenant, idempotency_key) pair
 * (UNIQUE). Fixed acquisition order (event, then key) makes deadlock
 * structurally impossible: every claimer takes them in this order and
 * nothing outside the sync engine ever requests these lock domains.
 * xact-scoped locks are released automatically at COMMIT/ROLLBACK — a
 * crashed or failed transaction never leaks its claim (crash safety). */
async function claimEventDomain(ctx: {
  tenantId: string;
  query: (sql: string, params: unknown[]) => Promise<unknown>;
}, eventId: string, idempotencyKey: string): Promise<void> {
  await ctx.query(`SELECT pg_advisory_xact_lock(${ADVISORY_KEY_SQL})`, [`sync-event:${eventId}`]);
  await ctx.query(`SELECT pg_advisory_xact_lock(${ADVISORY_KEY_SQL})`, [`sync-idem:${ctx.tenantId}:${idempotencyKey}`]);
}

/** The registry row re-read under the claim. */
type AppliedEventRow = {
  outcome: string;
  response: Record<string, unknown> | null;
  payload_fingerprint: string | null;
} & Record<string, unknown>;

/** What the apply transaction decided (mapped to a SyncEventOutcome after
 * the UnitOfWork boundary — the wire types never cross the tx edge). */
type ApplyDecision =
  | { kind: 'posted'; result: Record<string, unknown> }
  | { kind: 'duplicate'; result: Record<string, unknown> }
  | { kind: 'reuse'; message: string };

interface SyncPrincipal extends SalePrincipal {
  deviceId: string;
}

/**
 * Offline sync engine, server half (offline-sync §4):
 *
 * PUSH — each event is applied in EXACTLY ONE PG transaction through the
 * same posting coordinator as online commands (SalePoster / PaymentService).
 * CONCURRENCY (final-review blocker #1): the transaction first CLAIMS the
 * event's idempotency domain with transaction-scoped advisory locks over
 * both registry identities (event id + tenant/idempotency-key), then
 * re-reads `sync_applied_event` UNDER the claim, then posts. Two truly
 * simultaneous deliveries of the same event/key therefore serialize at the
 * transaction boundary and converge deterministically:
 *  - kill/crash mid-apply → everything rolls back (claim included — xact
 *    locks die with the transaction), nothing applied, retry safe;
 *  - duplicate delivery (same eventId or idempotencyKey, same payload) →
 *    the stored response is returned as `duplicate` with the ORIGINAL
 *    result — the device converges, the ledger never sees a second
 *    document, and NO caller ever surfaces a raw 23505/generic error;
 *  - same key, DIFFERENT payload → `idempotency_key_reuse` conflict;
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
    // Phase 6 device administration guard: a REVOKED device must never sync,
    // even with an otherwise-valid user token (credential rotation safety).
    await this.uow.run({ tenantId: principal.tenantId }, async (ctx) => {
      const device = await ctx.query<{ status: string }>(
        `SELECT status FROM device WHERE id = $1 AND tenant_id = $2`,
        [dto.deviceId, principal.tenantId],
      );
      if (device.rows.length === 0 || device.rows[0]!.status !== 'active') {
        throw new ForbiddenException(
          `device ${dto.deviceId} is not an active device of this tenant — re-pairing required`,
        );
      }
    });
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
    // 0. CANONICAL PAYLOAD IDENTITY (finding #5): the fingerprint of
    //    { type, payload } under canonical JSON (sorted keys, no
    //    whitespace). The same key with a DIFFERENT payload is a reuse
    //    conflict — never a silent second application of different business
    //    facts under a recycled idempotency key.
    const fingerprint = syncEventFingerprint(event.type, event.payload);

    // 1. CLAIM → RE-READ → POST → REGISTER, ALL inside ONE transaction
    //    (final-review blocker #1: the old unlocked pre-check followed by a
    //    bare INSERT let two simultaneous deliveries of the same key both
    //    pass the SELECT; the loser then surfaced a raw 23505/generic
    //    error instead of the deterministic idempotency outcome).
    //    The claim is a transaction-scoped advisory lock over BOTH registry
    //    identities (event id + tenant/idempotency-key), so every concurrent
    //    delivery of the same event or key is SERIALIZED at the transaction
    //    boundary; the re-read under the lock is the authoritative registry
    //    read, and the registry row commits WITH the business documents.
    try {
      const decision = await this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
        await claimEventDomain(ctx, event.eventId, event.idempotencyKey);

        // 2. authoritative re-read UNDER THE CLAIM: whoever won the race has
        //    either committed (row visible) or rolled back (no row) before
        //    this transaction proceeds — there is no in-flight state.
        const seen = await ctx.query<AppliedEventRow>(
          `SELECT outcome, response, payload_fingerprint FROM sync_applied_event
           WHERE event_id = $1 OR (tenant_id = $2 AND idempotency_key = $3)
           LIMIT 1`,
          [event.eventId, ctx.tenantId, event.idempotencyKey],
        );
        const prior = seen.rows[0] ?? null;
        if (prior) {
          // NULL fingerprint = a pre-hardening row: legacy duplicate
          // semantics (compat). A present-but-different fingerprint = key
          // reuse conflict.
          if (prior.payload_fingerprint != null && prior.payload_fingerprint !== fingerprint) {
            return {
              kind: 'reuse',
              message:
                'this idempotency key (or event id) was already used for a DIFFERENT payload — reusing it is a conflict, never a silent duplicate',
            } satisfies ApplyDecision;
          }
          return { kind: 'duplicate', result: (prior.response ?? {}) as Record<string, unknown> } satisfies ApplyDecision;
        }

        // 3. business posting through the SAME posting coordinator as
        //    online commands — still inside the claimed transaction.
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

        // 4. registry row in the SAME transaction: durable only at COMMIT,
        //    together with every business document above. The claim makes
        //    this INSERT race-free (a 23505 here would indicate a lock-domain
        //    bug, not a retriable race).
        await ctx.query(
          `INSERT INTO sync_applied_event
             (event_id, tenant_id, device_id, idempotency_key, event_type, outcome, response, payload_fingerprint, occurred_at)
           VALUES ($1,$2,$3,$4,$5,'applied',$6,$7,$8)`,
          [event.eventId, ctx.tenantId, p.deviceId, event.idempotencyKey, event.type, JSON.stringify(applied), fingerprint, event.occurredAt ?? null],
        );

        // 5. crash-safety hook (test-only): simulate a process death AFTER
        //    the claim, the business writes AND the registry insert but
        //    BEFORE COMMIT — proves none of it is durable until the commit
        //    record hits the WAL (the retry must apply exactly once).
        if ((event.payload as Record<string, unknown> | null | undefined)?.simulateCrashBeforeCommit === true) {
          throw new Error('simulated crash after claim, writes and registration, before commit (crash-safety test)');
        }
        return { kind: 'posted', result: applied } satisfies ApplyDecision;
      });

      switch (decision.kind) {
        case 'posted':
          return { eventId: event.eventId, status: 'applied', result: decision.result };
        case 'duplicate':
          return { eventId: event.eventId, status: 'duplicate', result: decision.result };
        case 'reuse':
          return { eventId: event.eventId, status: 'conflict', code: 'idempotency_key_reuse', message: decision.message };
      }
    } catch (err) {
      const code = conflictCodes(err);
      const message = err instanceof Error ? err.message : 'sync apply failed';
      if (code) {
        // CONFLICT (business outcome: oversold stock, stale config, credit,
        // unauthorized override) is recorded — a naive device retry gets
        // `duplicate`, never a delayed second application of a
        // business-conflicting sale. The accountant/supervisor resolves it
        // from the review queue (offline-sync §5b).
        //
        // Recording happens in its own transaction (the apply rolled
        // back) and takes the SAME claim first, so it cannot race a
        // concurrent applier of the same event/key; the untargeted ON
        // CONFLICT DO NOTHING makes it skip silently when the registry
        // slot was legitimately taken in between (the business outcome is
        // still returned to the device — evidence recording never turns a
        // deterministic conflict into a raw 23505 or a generic error).
        await this.uow
          .run({ tenantId: p.tenantId }, async (ctx) => {
            await claimEventDomain(ctx, event.eventId, event.idempotencyKey);
            await ctx.query(
              `INSERT INTO sync_applied_event
                 (event_id, tenant_id, device_id, idempotency_key, event_type, outcome, response, payload_fingerprint, occurred_at)
               VALUES ($1,$2,$3,$4,$5,'conflict',$6,$7,$8)
               ON CONFLICT DO NOTHING`,
              [
                event.eventId, ctx.tenantId, p.deviceId, event.idempotencyKey, event.type,
                JSON.stringify({ code, message }), fingerprint, event.occurredAt ?? null,
              ],
            );
          })
          .catch(() => undefined); // best-effort evidence: the conflict outcome itself is the answer
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
