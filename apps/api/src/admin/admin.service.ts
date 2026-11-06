/**
 * Administration (Phase 5 §15–16): versioned tenant settings, first-class
 * audit search/export, and the OPTIONAL loyalty foundation.
 *
 * Settings are effective-dated VERSIONS: creating a new value never
 * rewrites history — a document posted under policy v1 keeps its v1
 * semantics. Every change is audited.
 *
 * Audit search enforces tenant isolation via RLS, server-side pagination,
 * and exports bounded by the same authorization scope. Sensitive values
 * never appear in audit payloads (the audit writer contract forbids
 * credentials; settings values that look like secrets are rejected here).
 *
 * Loyalty: the tables and service exist as a foundation, but programs are
 * INACTIVE by default and nothing enrolls a customer automatically. The
 * legacy loyalty DDL never ran, so there is no history to import —
 * activation is an explicit business decision recorded as an audited
 * settings change (loyalty.enabled) plus program activation.
 */
import { Injectable } from '@nestjs/common';
import type {
  AuditEventDto,
  CreateLoyaltyProgram,
  EnrollLoyalty,
  LoyaltyProgramDto,
  TenantSettingDto,
} from '@idepot/contracts';
import { NotFoundError, ValidationError, parseMoney } from '@idepot/domain';
import { randomUUID } from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class
import { UnitOfWork } from '../db/unit-of-work.js';

type Principal = { userId: string; tenantId: string; displayName: string };

@Injectable()
export class AdminService {
  constructor(private readonly uow: UnitOfWork) {}

  // =========================================================================
  // Versioned tenant settings
  // =========================================================================

  async listSettings(tenantId: string, key?: string): Promise<TenantSettingDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT * FROM tenant_setting WHERE tenant_id = $1 AND ($2::text IS NULL OR key = $2)
         ORDER BY key, effective_from DESC`,
        [ctx.tenantId, key ?? null],
      );
      return (rows.rows as Array<Record<string, unknown>>).map((r) => this.mapSetting(r));
    });
  }

  /** The effective value of a key at a date (latest version). */
  async effectiveSetting(tenantId: string, key: string, at?: string): Promise<unknown> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT value FROM tenant_setting
          WHERE tenant_id = $1 AND key = $2 AND effective_from <= COALESCE($3::date, CURRENT_DATE)
            AND (effective_to IS NULL OR effective_to >= COALESCE($3::date, CURRENT_DATE))
          ORDER BY effective_from DESC LIMIT 1`,
        [ctx.tenantId, key, at ?? null],
      );
      return rows.rows.length === 0 ? null : rows.rows[0]!.value;
    });
  }

  async upsertSetting(principal: Principal, dto: { key: string; value: unknown; effectiveFrom?: string; effectiveTo?: string | null; note?: string | null }): Promise<TenantSettingDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      this.assertSafeValue(dto.key, dto.value);
      const id = randomUUID();
      await ctx.query(
        `INSERT INTO tenant_setting (id, tenant_id, key, value, effective_from, effective_to, note, created_by)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,
        [
          id, ctx.tenantId, dto.key, JSON.stringify(dto.value ?? null),
          dto.effectiveFrom ?? new Date().toISOString().slice(0, 10), dto.effectiveTo ?? null,
          dto.note ?? null, principal.userId,
        ],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'settings.changed',
        entityType: 'tenant_setting',
        entityId: dto.key,
        details: { key: dto.key, effectiveFrom: dto.effectiveFrom ?? 'today', note: dto.note ?? null },
      });
      const row = await ctx.query(`SELECT * FROM tenant_setting WHERE id = $1`, [id]);
      return this.mapSetting(row.rows[0]!);
    });
  }

  /** Guard: settings must never carry credential-shaped values. */
  private assertSafeValue(key: string, value: unknown): void {
    const s = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    if (/password|secret|token|api[-_]?key|credential/i.test(key)) {
      throw new ValidationError(`settings key '${key}' looks credential-shaped — secrets are stored in environment configuration, never in tenant settings`);
    }
    if (typeof s === 'string' && s.length > 100_000) {
      throw new ValidationError('setting value too large (max ~100 KB)');
    }
  }

  private mapSetting(r: Record<string, unknown>): TenantSettingDto {
    return {
      id: String(r.id),
      key: String(r.key),
      value: r.value,
      effectiveFrom: String(r.effective_from).slice(0, 10),
      effectiveTo: r.effective_to == null ? null : String(r.effective_to).slice(0, 10),
      note: r.note == null ? null : String(r.note),
      createdBy: r.created_by == null ? null : String(r.created_by),
      createdAt: String(r.created_at),
    };
  }

  // =========================================================================
  // Audit search & export (first-class, tenant-isolated, paginated)
  // =========================================================================

  async searchAudit(
    tenantId: string,
    q: {
      query?: string | null;
      userId?: string | null;
      entityType?: string | null;
      entityId?: string | null;
      action?: string | null;
      from?: string | null;
      to?: string | null;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: AuditEventDto[]; total: number }> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const conditions = ['a.tenant_id = $1'];
      const params: unknown[] = [ctx.tenantId];
      const add = (v: unknown, sql: string) => {
        params.push(v);
        conditions.push(sql.replace('$n', `$${params.length}`));
      };
      if (q.query) add(`%${q.query}%`, `(a.action ILIKE $n OR a.entity_type ILIKE $n OR a.entity_id ILIKE $n OR a.actor_display ILIKE $n OR a.details::text ILIKE $n)`);
      if (q.userId) add(q.userId, `a.actor_user_id = $n`);
      if (q.entityType) add(q.entityType, `a.entity_type = $n`);
      if (q.entityId) add(q.entityId, `a.entity_id = $n`);
      if (q.action) add(q.action, `a.action = $n`);
      if (q.from) add(q.from, `(a.occurred_at AT TIME ZONE 'UTC')::date >= $n::date`);
      if (q.to) add(q.to, `(a.occurred_at AT TIME ZONE 'UTC')::date <= $n::date`);
      const where = conditions.join(' AND ');
      const total = await ctx.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM audit_event a WHERE ${where}`, params);
      const limit = Math.min(q.limit ?? 100, 500);
      params.push(limit, q.offset ?? 0);
      const rows = await ctx.query(
        `SELECT a.* FROM audit_event a WHERE ${where}
         ORDER BY a.occurred_at DESC, a.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return {
        items: (rows.rows as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          occurredAt: String(r.occurred_at),
          actorUserId: r.actor_user_id == null ? null : String(r.actor_user_id),
          actorDisplay: String(r.actor_display),
          action: String(r.action),
          entityType: String(r.entity_type),
          entityId: r.entity_id == null ? null : String(r.entity_id),
          details: (r.details ?? {}) as Record<string, unknown>,
        })),
        total: Number(total.rows[0]!.n),
      };
    });
  }

  /** Bounded audit export (same scope as search; CSV rows). */
  async exportAuditCsv(
    tenantId: string,
    q: Parameters<AdminService['searchAudit']>[1],
  ): Promise<string> {
    const result = await this.searchAudit(tenantId, { ...q, limit: 500, offset: 0 });
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = 'occurred_at,actor,action,entity_type,entity_id,details';
    const lines = result.items.map((e) =>
      [
        e.occurredAt,
        e.actorDisplay,
        e.action,
        e.entityType,
        e.entityId ?? '',
        JSON.stringify(e.details),
      ]
        .map(esc)
        .join(','),
    );
    return [header, ...lines].join('\n');
  }

  // =========================================================================
  // Linked document timeline (invoice → return → credit note → refund /
  // store credit — the §16 drilldown)
  // =========================================================================

  async documentTimeline(tenantId: string, invoiceId: string): Promise<
    Array<{ documentType: string; documentId: string; code: string | null; businessDate: string | null; description: string; amount: string | null }>
  > {
    return this.uow.run({ tenantId }, async (ctx) => {
      const out: Array<{ documentType: string; documentId: string; code: string | null; businessDate: string | null; description: string; amount: string | null }> = [];
      const inv = await ctx.query(`SELECT id, code, business_date, total FROM invoice WHERE id = $1`, [invoiceId]);
      if (inv.rows.length === 0) throw new NotFoundError('invoice', invoiceId);
      const i = inv.rows[0]!;
      out.push({
        documentType: 'invoice', documentId: String(i.id), code: String(i.code),
        businessDate: String(i.business_date).slice(0, 10), description: 'original posted sale',
        amount: String(i.total),
      });
      const returns = await ctx.query(
        `SELECT * FROM return_order WHERE invoice_id = $1 ORDER BY created_at`,
        [invoiceId],
      );
      for (const r of returns.rows as Array<Record<string, unknown>>) {
        out.push({
          documentType: 'return_order', documentId: String(r.id), code: String(r.code),
          businessDate: String(r.business_date).slice(0, 10),
          description: `return (${String(r.status)})`, amount: r.gross_credit == null ? null : String(r.gross_credit),
        });
        if (r.credit_note_id != null) {
          const cn = await ctx.query(`SELECT * FROM credit_note WHERE id = $1`, [r.credit_note_id]);
          const c = cn.rows[0]!;
          out.push({
            documentType: 'credit_note', documentId: String(c.id), code: String(c.code),
            businessDate: String(c.business_date).slice(0, 10),
            description: 'credit note (return credit)', amount: String(c.total),
          });
          const refunds = await ctx.query(`SELECT * FROM refund WHERE credit_note_id = $1 ORDER BY created_at`, [c.id]);
          for (const f of refunds.rows as Array<Record<string, unknown>>) {
            out.push({
              documentType: 'refund', documentId: String(f.id), code: String(f.code),
              businessDate: String(f.business_date).slice(0, 10),
              description: `refund (${String(f.status)})`, amount: String(f.amount),
            });
          }
          const credits = await ctx.query(`SELECT * FROM store_credit WHERE credit_note_id = $1 ORDER BY created_at`, [c.id]);
          for (const sc of credits.rows as Array<Record<string, unknown>>) {
            out.push({
              documentType: 'store_credit', documentId: String(sc.id), code: String(sc.code),
              businessDate: String(sc.business_date).slice(0, 10),
              description: `store credit (${String(sc.status)})`, amount: String(sc.amount),
            });
          }
        }
      }
      return out;
    });
  }

  // =========================================================================
  // Optional loyalty foundation (feature-flagged OFF by default)
  // =========================================================================

  async listLoyaltyPrograms(tenantId: string): Promise<LoyaltyProgramDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(`SELECT * FROM loyalty_program WHERE tenant_id = $1 ORDER BY created_at`, [ctx.tenantId]);
      return (rows.rows as Array<Record<string, unknown>>).map((r) => this.mapProgram(r));
    });
  }

  async createLoyaltyProgram(principal: Principal, dto: CreateLoyaltyProgram): Promise<LoyaltyProgramDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      // the feature flag must be consciously enabled first (audited)
      const flag = await this.effectiveSettingWithinCtx(ctx, 'loyalty.enabled');
      if (flag !== true) {
        throw new ValidationError(
          'loyalty is disabled for this tenant — enable the loyalty.enabled setting (an audited business decision) before creating programs',
        );
      }
      const id = randomUUID();
      await ctx.query(
        `INSERT INTO loyalty_program (id, tenant_id, code, name, is_active, points_per_currency,
           redemption_rate, min_redeem_points, points_expiry_days, note)
         VALUES ($1,$2,$3,$4,false,$5,$6,$7,$8,$9)`,
        [
          id, ctx.tenantId, dto.code, dto.name, dto.pointsPerCurrency, dto.redemptionRate,
          dto.minRedeemPoints ?? null, dto.pointsExpiryDays ?? null, dto.note ?? null,
        ],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'loyalty.program_created', entityType: 'loyalty_program', entityId: id,
        details: { code: dto.code, name: dto.name, isActive: false },
      });
      const row = await ctx.query(`SELECT * FROM loyalty_program WHERE id = $1`, [id]);
      return this.mapProgram(row.rows[0]!);
    });
  }

  async setLoyaltyProgramActive(principal: Principal, programId: string, isActive: boolean): Promise<LoyaltyProgramDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      if (isActive) {
        const flag = await this.effectiveSettingWithinCtx(ctx, 'loyalty.enabled');
        if (flag !== true) {
          throw new ValidationError('enable the loyalty.enabled setting before activating a program');
        }
      }
      const row = await ctx.query(`UPDATE loyalty_program SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING *`, [programId, isActive]);
      if (row.rows.length === 0) throw new NotFoundError('loyalty program', programId);
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: isActive ? 'loyalty.program_activated' : 'loyalty.program_deactivated',
        entityType: 'loyalty_program', entityId: programId,
        details: { code: String(row.rows[0]!.code) },
      });
      return this.mapProgram(row.rows[0]!);
    });
  }

  async enrollLoyalty(principal: Principal, dto: EnrollLoyalty): Promise<{ accountId: string }> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const program = await ctx.query(`SELECT * FROM loyalty_program WHERE id = $1`, [dto.programId]);
      if (program.rows.length === 0) throw new NotFoundError('loyalty program', dto.programId);
      if (!program.rows[0]!.is_active) {
        throw new ValidationError('loyalty program is not active — no enrollment is possible');
      }
      const id = randomUUID();
      await ctx.query(
        `INSERT INTO loyalty_account (id, tenant_id, program_id, customer_id, points_balance, status)
         VALUES ($1,$2,$3,$4,0,'active')`,
        [id, ctx.tenantId, dto.programId, dto.customerId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'loyalty.customer_enrolled', entityType: 'loyalty_account', entityId: id,
        details: { customerId: dto.customerId, consentNote: dto.consentNote, programId: dto.programId },
      });
      return { accountId: id };
    });
  }

  private async effectiveSettingWithinCtx(ctx: { tenantId: string; query: unknown }, key: string): Promise<unknown> {
    const rows = await (ctx as { query: Function }).query(
      `SELECT value FROM tenant_setting
        WHERE tenant_id = $1 AND key = $2 AND effective_from <= CURRENT_DATE
          AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ORDER BY effective_from DESC LIMIT 1`,
      [ctx.tenantId, key],
    );
    return rows.rows.length === 0 ? null : rows.rows[0]!.value;
  }

  private mapProgram(r: Record<string, unknown>): LoyaltyProgramDto {
    return {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      isActive: Boolean(r.is_active),
      pointsPerCurrency: String(r.points_per_currency),
      redemptionRate: String(r.redemption_rate),
      minRedeemPoints: r.min_redeem_points == null ? null : Number(r.min_redeem_points),
      pointsExpiryDays: r.points_expiry_days == null ? null : Number(r.points_expiry_days),
      note: r.note == null ? null : String(r.note),
      createdAt: String(r.created_at),
    };
  }
}

void parseMoney;
