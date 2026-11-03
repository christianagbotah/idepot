/**
 * Chart of accounts administration + accounting periods (Phase 4).
 *
 * - accounts are NEVER destructively deleted: deactivation (retired_at)
 *   is the only end-state, and only when no journal line, mapping,
 *   bank account or tax component references the account;
 * - the purpose→account mapping is the posting engine's ONLY account
 *   resolution path (no hard-coded account ids anywhere);
 * - periods carry the close/soft-close/reopen workflow with audit
 *   evidence, and the posting lock itself lives in
 *   FinancialConfigurationService.assertPeriodOpen (single choke point).
 */
import { Injectable } from '@nestjs/common';
import type {
  AccountingPeriodDto,
  CreateGlAccount,
  CreatePeriods,
  GlAccountFullDto,
  PeriodTransition,
  SetGlMapping,
  UpdateGlAccount,
} from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  broadTypeForClass,
  classForBroadType,
  normalBalanceForClass,
  type AccountClass,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
import { accountingPeriodLockKey } from '../finance/financial-configuration.service.js';
import { dateCol, dateColNull, pgCode, requireRow } from '../purchasing/purchasing-common.js';

interface AccountingPrincipal {
  userId: string;
  tenantId: string;
  displayName: string;
}

@Injectable()
export class ChartOfAccountsService {
  constructor(private readonly uow: UnitOfWork) {}

  /* -------------------------------- accounts ------------------------------ */

  async createAccount(principal: AccountingPrincipal, dto: CreateGlAccount): Promise<GlAccountFullDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const accountClass: AccountClass =
        dto.accountClass ?? classForBroadType(dto.accountType);
      if (broadTypeForClass(accountClass) !== dto.accountType) {
        throw new ValidationError(`account class "${accountClass}" is not a ${dto.accountType}`);
      }
      const normalBalance = dto.normalBalance ?? normalBalanceForClass(accountClass);

      let parentId: string | null = null;
      if (dto.parentCode != null && dto.parentCode !== '') {
        const parent = await ctx.query<{ id: string; is_posting: boolean }>(
          `SELECT id, is_posting FROM gl_account WHERE tenant_id = $1 AND code = $2`,
          [ctx.tenantId, dto.parentCode],
        );
        if (parent.rows.length === 0) throw new NotFoundError('gl_account (parent, by code)', dto.parentCode);
        if (Boolean(parent.rows[0]!.is_posting)) {
          throw new ValidationError('parent accounts must be non-posting grouping accounts');
        }
        parentId = parent.rows[0]!.id;
      }

      const isPosting = dto.isPosting ?? true;
      if (!isPosting && parentId == null && dto.parentCode !== '') {
        throw new ValidationError('a non-posting account without a parent is meaningless');
      }

      let id: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO gl_account
             (tenant_id, code, name, account_type, account_class, parent_account_id,
              normal_balance, is_posting, is_control, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [
            ctx.tenantId, dto.code, dto.name, dto.accountType, accountClass, parentId,
            normalBalance, isPosting, dto.isControl ?? false, dto.description ?? null,
          ],
        );
        id = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') throw new ConflictError(`account code "${dto.code}" already exists`);
        if (pgCode(err) === 'P0001') {
          throw new ConflictError('accounting period configuration conflict');
        }
        throw err;
      }

      // hierarchy cycle guard (parent chains must terminate at a root)
      await this.assertNoCycle(ctx, id, parentId);

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'gl_account.created',
        entityType: 'gl_account',
        entityId: id,
        details: { code: dto.code, name: dto.name, accountType: dto.accountType, accountClass, parentCode: dto.parentCode ?? null },
      });
      return this.accountDto(ctx, id);
    });
  }

  async updateAccount(
    principal: AccountingPrincipal,
    accountId: string,
    dto: UpdateGlAccount,
  ): Promise<GlAccountFullDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const acc = await requireRow<Record<string, unknown>>(ctx, 'gl_account', accountId);
      // immutable after financial use: code, class, type, normal balance
      if (dto.name == null && dto.description == null && dto.isActive == null && dto.parentCode === undefined) {
        throw new ValidationError('nothing to update');
      }
      let parentId: string | null | undefined;
      if (dto.parentCode !== undefined) {
        if (dto.parentCode == null || dto.parentCode === '') {
          parentId = null;
        } else {
          const parent = await ctx.query<{ id: string }>(
            `SELECT id FROM gl_account WHERE tenant_id = $1 AND code = $2`,
            [ctx.tenantId, dto.parentCode],
          );
          if (parent.rows.length === 0) throw new NotFoundError('gl_account (parent, by code)', dto.parentCode);
          parentId = parent.rows[0]!.id;
        }
      }
      await ctx.query(
        `UPDATE gl_account SET
           name = COALESCE($3, name),
           parent_account_id = COALESCE($4, parent_account_id),
           description = COALESCE($5, description),
           is_active = COALESCE($6, is_active)
         WHERE id = $1 AND tenant_id = $2`,
        [accountId, ctx.tenantId, dto.name ?? null, parentId ?? null, dto.description ?? null, dto.isActive ?? null],
      );
      if (parentId !== undefined) await this.assertNoCycle(ctx, accountId,parentId);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'gl_account.updated',
        entityType: 'gl_account',
        entityId: accountId,
        details: { code: String(acc.code), changes: dto },
      });
      return this.accountDto(ctx, accountId);
    });
  }

  /** Safe deactivation — never a destructive delete. Blocked while the
   *  account is referenced by financial evidence or configuration. */
  async deactivateAccount(principal: AccountingPrincipal, accountId: string): Promise<GlAccountFullDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const acc = await requireRow<Record<string, unknown>>(ctx, 'gl_account', accountId);
      const usage = await ctx.query<{ journal_lines: string; mappings: string; bank_accounts: string; tax_components: string; children: string }>(
        `SELECT
           (SELECT count(*) FROM journal_line WHERE account_id = $1 AND tenant_id = $2)::text AS journal_lines,
           (SELECT count(*) FROM gl_mapping WHERE account_id = $1 AND tenant_id = $2)::text AS mappings,
           (SELECT count(*) FROM bank_account WHERE gl_account_id = $1 AND tenant_id = $2)::text AS bank_accounts,
           (SELECT count(*) FROM tax_component WHERE gl_account_id = $1 AND tenant_id = $2)::text AS tax_components,
           (SELECT count(*) FROM gl_account WHERE parent_account_id = $1 AND tenant_id = $2)::text AS children`,
        [accountId, ctx.tenantId],
      );
      const u = usage.rows[0]!;
      const blockers: string[] = [];
      if (u.journal_lines !== '0') blockers.push(`${u.journal_lines} journal lines`);
      if (u.mappings !== '0') blockers.push('a purpose mapping');
      if (u.bank_accounts !== '0') blockers.push('a bank account');
      if (u.tax_components !== '0') blockers.push('a tax component override');
      if (u.children !== '0') blockers.push(`${u.children} child accounts`);
      if (blockers.length > 0) {
        throw new ConflictError(
          `account ${String(acc.code)} cannot be deactivated: it is referenced by ${blockers.join(', ')} ` +
            `(financial evidence is immutable; retire by mapping the purpose elsewhere first)`,
        );
      }
      await ctx.query(
        `UPDATE gl_account SET is_active = false, retired_at = CURRENT_DATE WHERE id = $1 AND tenant_id = $2`,
        [accountId, ctx.tenantId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'gl_account.deactivated',
        entityType: 'gl_account',
        entityId: accountId,
        details: { code: String(acc.code) },
      });
      return this.accountDto(ctx, accountId);
    });
  }

  async listAccounts(tenantId: string): Promise<GlAccountFullDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT a.*, p.code AS parent_code FROM gl_account a
         LEFT JOIN gl_account p ON p.id = a.parent_account_id
         WHERE a.tenant_id = $1 ORDER BY a.code`,
        [ctx.tenantId],
      );
      return res.rows.map((r) => this.mapAccountRow(r));
    });
  }

  /* -------------------------------- mappings ------------------------------ */

  async setMapping(principal: AccountingPrincipal, dto: SetGlMapping): Promise<{ purpose: string; accountCode: string }> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const acc = await ctx.query<{ id: string; is_active: boolean; is_posting: boolean }>(
        `SELECT id, is_active, is_posting FROM gl_account WHERE tenant_id = $1 AND code = $2`,
        [ctx.tenantId, dto.accountCode],
      );
      if (acc.rows.length === 0) throw new NotFoundError('gl_account (by code)', dto.accountCode);
      if (!Boolean(acc.rows[0]!.is_active) || !Boolean(acc.rows[0]!.is_posting)) {
        throw new ValidationError('purpose targets must be active posting accounts');
      }
      const existing = await ctx.query<{ id: string; account_id: string }>(
        `SELECT id, account_id FROM gl_mapping WHERE tenant_id = $1 AND purpose = $2`,
        [ctx.tenantId, dto.purpose],
      );
      if (existing.rows.length > 0) {
        await ctx.query(`UPDATE gl_mapping SET account_id = $3 WHERE id = $1 AND tenant_id = $2`, [
          existing.rows[0]!.id, ctx.tenantId, acc.rows[0]!.id,
        ]);
      } else {
        try {
          await ctx.query(
            `INSERT INTO gl_mapping (tenant_id, purpose, account_id) VALUES ($1,$2,$3)`,
            [ctx.tenantId, dto.purpose, acc.rows[0]!.id],
          );
        } catch (err) {
          if (pgCode(err) === '23505') throw new ConflictError(`purpose "${dto.purpose}" is already mapped`);
          throw err;
        }
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'gl_mapping.set',
        entityType: 'gl_mapping',
        entityId: `${ctx.tenantId}:${dto.purpose}`,
        details: { purpose: dto.purpose, accountCode: dto.accountCode, previousAccountId: existing.rows[0]?.account_id ?? null },
      });
      return { purpose: dto.purpose, accountCode: dto.accountCode };
    });
  }

  /* -------------------------------- periods ------------------------------- */

  /** Creates the calendar-month periods of a fiscal year (idempotent). */
  async createFiscalYearPeriods(principal: AccountingPrincipal, dto: CreatePeriods): Promise<AccountingPeriodDto[]> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const year = dto.fiscalYear;
      const months = dto.months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const created: AccountingPeriodDto[] = [];
      for (const m of months) {
        const start = `${year}-${String(m).padStart(2, '0')}-01`;
        const endDate = new Date(Date.UTC(year, m, 0)); // last day of month
        const end = endDate.toISOString().slice(0, 10);
        const name = `${year}-${String(m).padStart(2, '0')}`;
        const exists = await ctx.query<{ id: string }>(
          `SELECT id FROM accounting_period WHERE tenant_id = $1 AND period_name = $2`,
          [ctx.tenantId, name],
        );
        if (exists.rows.length > 0) continue;
        try {
          const res = await ctx.query<{ id: string }>(
            `INSERT INTO accounting_period (tenant_id, fiscal_year, period_number, period_name, starts_on, ends_on)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [ctx.tenantId, year, m, name, start, end],
          );
          created.push(await this.periodDto(ctx, res.rows[0]!.id));
        } catch (err) {
          if (pgCode(err) === 'P0001' || /overlaps an existing period/.test(String(err))) {
            throw new ConflictError(`period ${name} overlaps an existing period`);
          }
          if (pgCode(err) === '23505') continue; // concurrent creation is benign
          throw err;
        }
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'accounting_period.created',
        entityType: 'accounting_period',
        entityId: `${year}`,
        details: { fiscalYear: year, months },
      });
      return created;
    });
  }

  /** Status transition: open → soft_closed → closed, and audited reopen. */
  async transitionPeriod(
    principal: AccountingPrincipal,
    periodId: string,
    dto: PeriodTransition,
  ): Promise<AccountingPeriodDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      // EXCLUSIVE period lock (review round 2): a closing/soft-closing
      // transition serializes against every open posting transaction —
      // each posting holds the same lock SHARED until commit, so a close
      // can never slip under a check that has already passed. Reopenings
      // do not need the exclusive lock (they only ever unblock posters).
      if (dto.status !== 'open') {
        await ctx.query(
          `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
          [accountingPeriodLockKey(principal.tenantId, periodId)],
        );
      }
      const period = await requireRow<Record<string, unknown>>(ctx, 'accounting_period', periodId);
      const from = String(period.status);
      const to = dto.status;
      const allowed: Record<string, string[]> = {
        open: ['soft_closed', 'closed'],
        soft_closed: ['closed', 'open'],
        closed: ['open'],
      };
      if (!allowed[from]?.includes(to)) {
        throw new ConflictError(`period transition ${from} → ${to} is not allowed`);
      }
      if (to === 'open' && (dto.reason == null || dto.reason.length < 10)) {
        throw new ValidationError('reopening a period requires a reason of at least 10 characters');
      }
      if (to !== 'open') {
        await ctx.query(
          `UPDATE accounting_period
           SET status = $3, closed_at = now(), closed_by = $4, reopen_reason = NULL, reopened_at = NULL, reopened_by = NULL
           WHERE id = $1 AND tenant_id = $2`,
          [periodId, ctx.tenantId, to, principal.userId],
        );
      } else {
        await ctx.query(
          `UPDATE accounting_period
           SET status = 'open', reopen_reason = $3, reopened_at = now(), reopened_by = $4
           WHERE id = $1 AND tenant_id = $2`,
          [periodId, ctx.tenantId, dto.reason ?? null, principal.userId],
        );
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: to === 'open' ? 'accounting_period.reopened' : `accounting_period.${to}`,
        entityType: 'accounting_period',
        entityId: periodId,
        details: { from, to, reason: dto.reason ?? null, periodName: String(period.period_name) },
      });
      return this.periodDto(ctx, periodId);
    });
  }

  async listPeriods(tenantId: string): Promise<AccountingPeriodDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<{ id: string }>(
        `SELECT id FROM accounting_period WHERE tenant_id = $1 ORDER BY starts_on`,
        [ctx.tenantId],
      );
      const out: AccountingPeriodDto[] = [];
      for (const r of res.rows) out.push(await this.periodDto(ctx, r.id));
      return out;
    });
  }

  /* -------------------------------- helpers ------------------------------- */

  private async assertNoCycle(ctx: UowContext, accountId: string, parentId: string | null): Promise<void> {
    let cursor = parentId;
    const seen = new Set<string>([accountId]);
    while (cursor != null) {
      if (seen.has(cursor)) {
        throw new ValidationError('account hierarchy would contain a cycle');
      }
      seen.add(cursor);
      const row = await ctx.query<{ parent_account_id: string | null }>(
        `SELECT parent_account_id FROM gl_account WHERE id = $1 AND tenant_id = $2`,
        [cursor, ctx.tenantId],
      );
      cursor = row.rows[0]?.parent_account_id ?? null;
    }
  }

  private async accountDto(ctx: UowContext, id: string): Promise<GlAccountFullDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT a.*, p.code AS parent_code FROM gl_account a
       LEFT JOIN gl_account p ON p.id = a.parent_account_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [id, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('gl_account', id);
    return this.mapAccountRow(res.rows[0]!);
  }

  private mapAccountRow(r: Record<string, unknown>): GlAccountFullDto {
    return {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      accountType: String(r.account_type),
      accountClass: String(r.account_class),
      parentAccountId: r.parent_account_id ? String(r.parent_account_id) : null,
      parentCode: r.parent_code ? String(r.parent_code) : null,
      normalBalance: String(r.normal_balance),
      isPosting: Boolean(r.is_posting),
      isControl: Boolean(r.is_control),
      isActive: Boolean(r.is_active),
      effectiveFrom: dateCol(r.effective_from),
      retiredAt: dateColNull(r.retired_at),
      description: r.description ? String(r.description) : null,
    };
  }

  private async periodDto(ctx: UowContext, id: string): Promise<AccountingPeriodDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT * FROM accounting_period WHERE id = $1 AND tenant_id = $2`,
      [id, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('accounting_period', id);
    const r = res.rows[0]!;
    return {
      id: String(r.id),
      fiscalYear: Number(r.fiscal_year),
      periodNumber: Number(r.period_number),
      periodName: String(r.period_name),
      startsOn: dateCol(r.starts_on),
      endsOn: dateCol(r.ends_on),
      status: String(r.status),
      closedAt: r.closed_at ? new Date(r.closed_at as string).toISOString() : null,
      closedBy: r.closed_by ? String(r.closed_by) : null,
      reopenReason: r.reopen_reason ? String(r.reopen_reason) : null,
      reopenedAt: r.reopened_at ? new Date(r.reopened_at as string).toISOString() : null,
    };
  }
}
