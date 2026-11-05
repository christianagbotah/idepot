/**
 * General ledger inquiry + manual journals (Phase 4).
 *
 * Posted GL is immutable: corrections are new reversing entries with
 * reversal_of linkage, never edits (defect: destructive posted edits).
 * Manual journals require the accounting:journal permission, balance,
 * period-open validation and audit evidence.
 */
import { Injectable } from '@nestjs/common';
import type {
  JournalEntryDto,
  ManualJournal,
} from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type JournalLineSpec,
} from '@idepot/domain';
import { randomUUID } from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
import { requireRow } from '../purchasing/purchasing-common.js';

interface AccountingPrincipal {
  userId: string;
  tenantId: string;
  displayName: string;
}

export interface JournalFilter {
  from?: string;
  to?: string;
  accountCode?: string;
  sourceKind?: string;
  reference?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly finance: FinancialConfigurationService,
  ) {}

  /**
   * Journal inquiry with filters (period/date range, source, account,
   * reference) + pagination. Account drilldown shares the same shape.
   */
  async listJournals(tenantId: string, filter: JournalFilter): Promise<{ items: JournalEntryDto[]; total: number }> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'e.tenant_id = $1';
      if (filter.from) {
        params.push(filter.from);
        where += ` AND e.business_date >= $${params.length}::date`;
      }
      if (filter.to) {
        params.push(filter.to);
        where += ` AND e.business_date <= $${params.length}::date`;
      }
      if (filter.sourceKind) {
        params.push(filter.sourceKind);
        where += ` AND e.source_kind = $${params.length}`;
      }
      if (filter.reference) {
        params.push(`%${filter.reference}%`);
        where += ` AND e.reference ILIKE $${params.length}`;
      }
      if (filter.accountCode) {
        params.push(filter.accountCode);
        where += ` AND EXISTS (
          SELECT 1 FROM journal_line l JOIN gl_account a ON a.id = l.account_id
          WHERE l.entry_id = e.id AND a.code = $${params.length})`;
      }
      const countRes = await ctx.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM journal_entry e WHERE ${where}`,
        params,
      );
      const total = Number(countRes.rows[0]!.n);
      const limit = Math.min(filter.limit ?? 100, 500);
      const offset = filter.offset ?? 0;
      const entries = await ctx.query<Record<string, unknown>>(
        `SELECT e.id FROM journal_entry e WHERE ${where}
         ORDER BY e.business_date DESC, e.occurred_at DESC, e.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );
      const items: JournalEntryDto[] = [];
      for (const r of entries.rows) items.push(await this.entryDto(ctx, String(r.id)));
      return { items, total };
    });
  }

  async getJournal(tenantId: string, entryId: string): Promise<JournalEntryDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.entryDto(ctx, entryId));
  }

  /** Account ledger: every journal line of one account (drilldown target). */
  async accountLedger(
    tenantId: string,
    accountCode: string,
    filter: { from?: string; to?: string } = {},
  ): Promise<Array<JournalEntryDto & { lineDebit: string; lineCredit: string }>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId, accountCode];
      let where = 'e.tenant_id = $1 AND a.code = $2';
      if (filter.from) {
        params.push(filter.from);
        where += ` AND e.business_date >= $${params.length}::date`;
      }
      if (filter.to) {
        params.push(filter.to);
        where += ` AND e.business_date <= $${params.length}::date`;
      }
      const res = await ctx.query<{ id: string; debit: string; credit: string }>(
        `SELECT e.id, l.debit::text AS debit, l.credit::text AS credit
         FROM journal_entry e
         JOIN journal_line l ON l.entry_id = e.id
         JOIN gl_account a ON a.id = l.account_id
         WHERE ${where}
         ORDER BY e.business_date, e.occurred_at, e.created_at
         LIMIT 500`,
        params,
      );
      const out: Array<JournalEntryDto & { lineDebit: string; lineCredit: string }> = [];
      for (const r of res.rows) {
        const dto = await this.entryDto(ctx, r.id);
        out.push({ ...dto, lineDebit: r.debit, lineCredit: r.credit });
      }
      return out;
    });
  }

  /** Posts an approved manual journal (balanced, audited, period-checked). */
  async postManualJournal(principal: AccountingPrincipal, dto: ManualJournal): Promise<JournalEntryDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      // provision the neutral control chart idempotently so the seeded
      // codes resolve even on a tenant that has never posted a document
      await this.finance.ensureDefaults(ctx);
      // resolve every account code to a tenant-scoped active posting account
      const codes = [...new Set(dto.lines.map((l) => l.accountCode))];
      const accounts = await ctx.query<{ id: string; code: string; is_active: boolean; is_posting: boolean }>(
        `SELECT id, code, is_active, is_posting FROM gl_account WHERE tenant_id = $1 AND code = ANY($2)`,
        [ctx.tenantId, codes],
      );
      const byCode = new Map(accounts.rows.map((a) => [a.code, a]));
      for (const code of codes) {
        const acc = byCode.get(code);
        if (!acc) throw new NotFoundError('gl_account (by code)', code);
        if (!acc.is_active || !acc.is_posting) {
          throw new ValidationError(`account ${code} is not an active posting account`);
        }
      }
      const lines: JournalLineSpec[] = dto.lines.map((l) => ({
        accountId: byCode.get(l.accountCode)!.id,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo ?? null,
      }));
      // manual journals get their own synthetic source id; the builder +
      // the DB guard both refuse unbalanced entries
      const sourceId = randomUUID();
      const posted = await this.finance.postJournal(ctx, {
        sourceKind: 'manual_journal',
        sourceId,
        event: 'manual_posted',
        description: dto.description,
        businessDate: dto.businessDate,
        reference: dto.reference ?? null,
        createdBy: principal.userId,
        lines,
      });
      if (posted == null) throw new ValidationError('manual journal has no positive lines');
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'journal.manual_posted',
        entityType: 'journal_entry',
        entityId: posted.id,
        details: {
          businessDate: dto.businessDate,
          reference: dto.reference ?? null,
          description: dto.description,
          totalDebit: posted.totalDebit,
          totalCredit: posted.totalCredit,
        },
      });
      await ctx.outbox.emit('ManualJournalPosted', { journalEntryId: posted.id, businessDate: dto.businessDate });
      return this.entryDto(ctx, posted.id);
    });
  }

  /** Reverses a MANUAL journal (posted GL is immutable; a reversal is a
   *  new entry with reversal_of linkage). Source-document journals are
   *  reversed by their own correction documents, not by hand. */
  async reverseManualJournal(principal: AccountingPrincipal, entryId: string): Promise<JournalEntryDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const entry = await requireRow<Record<string, unknown>>(ctx, 'journal_entry', entryId);
      if (String(entry.source_kind) !== 'manual_journal') {
        throw new ConflictError(
          `only manual journals can be reversed here — ${String(entry.source_kind)} entries are reversed by their own correction documents`,
        );
      }
      const existing = await ctx.query<{ id: string }>(
        `SELECT id FROM journal_entry WHERE reversal_of_id = $1 AND tenant_id = $2`,
        [entryId, ctx.tenantId],
      );
      if (existing.rows.length > 0) {
        throw new ConflictError('this journal entry has already been reversed');
      }
      const lines = await ctx.query<{ account_id: string; debit: string; credit: string; memo: string | null }>(
        `SELECT account_id, debit::text AS debit, credit::text AS credit, memo
         FROM journal_line WHERE entry_id = $1 ORDER BY created_at, id`,
        [entryId],
      );
      if (lines.rows.length === 0) throw new NotFoundError('journal_line', entryId);
      const reversed: JournalLineSpec[] = lines.rows.map((l) => ({
        accountId: l.account_id,
        debit: l.credit,
        credit: l.debit,
        memo: `reversal: ${l.memo ?? ''}`.slice(0, 200),
      }));
      const posted = await this.finance.postJournal(ctx, {
        sourceKind: 'manual_journal',
        sourceId: String(entry.source_id),
        event: 'manual_reversed',
        description: `Reversal of manual journal ${String(entry.reference ?? entry.id)}`,
        businessDate: new Date().toISOString().slice(0, 10),
        reference: String(entry.reference ?? null),
        createdBy: principal.userId,
        allowSoftClosedPeriod: true,
        reversalOfId: entryId,
        lines: reversed,
      });
      if (posted == null) throw new ConflictError('nothing to reverse');
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'journal.manual_reversed',
        entityType: 'journal_entry',
        entityId: posted.id,
        details: { reversedEntryId: entryId },
      });
      return this.entryDto(ctx, posted.id);
    });
  }

  private async entryDto(ctx: UowContext, entryId: string): Promise<JournalEntryDto> {
    const e = await requireRow<Record<string, unknown>>(ctx, 'journal_entry', entryId);
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT l.*, a.code AS account_code, a.name AS account_name
       FROM journal_line l JOIN gl_account a ON a.id = l.account_id
       WHERE l.entry_id = $1 ORDER BY l.created_at, l.id`,
      [entryId],
    );
    return {
      id: String(e.id),
      sourceKind: String(e.source_kind),
      sourceId: String(e.source_id),
      event: String(e.event),
      description: e.description ? String(e.description) : null,
      occurredAt: new Date(e.occurred_at as string).toISOString(),
      totalDebit: String(e.total_debit),
      totalCredit: String(e.total_credit),
      reference: e.reference ? String(e.reference) : null,
      lines: lines.rows.map((l) => ({
        id: String(l.id),
        accountId: String(l.account_id),
        accountCode: String(l.account_code),
        accountName: String(l.account_name),
        debit: String(l.debit),
        credit: String(l.credit),
        memo: l.memo ? String(l.memo) : null,
      })),
    };
  }
}
