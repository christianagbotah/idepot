/**
 * Banking (Phase 4) — corrected model (payment-transaction-map §7):
 * bank accounts are first-class master data FK'd to the chart of
 * accounts (no more legacy name-string `accounts` rows); transfers are
 * atomic balanced documents with duplicate protection; statement
 * imports are fingerprinted (file sha256 + line identity) and treated
 * as UNTRUSTED INPUT (bounded size, safe parsing, parameterized SQL
 * only); matching is an explicit workflow — suggestions NEVER post.
 */
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  BankAccountDto,
  BankMatchSuggestionDto,
  BankReconciliationDto,
  BankStatementDto,
  BankTransferDto,
  BankTransferRequest,
  CreateBankAccount,
} from '@idepot/contracts';
import { ConflictError, NotFoundError, ValidationError, formatMoney, parseMoney } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from '../sales/document-sequence.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';
import { dateCol, dateColNull, pgCode, requireRow, type PurchasingPrincipal } from '../purchasing/purchasing-common.js';

const MAX_STATEMENT_BYTES = 5 * 1024 * 1024; // 5 MB bound on untrusted input
const MAX_STATEMENT_LINES = 20_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_RE = /^-?\d{1,14}(\.\d{1,4})?$/;

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** RFC-4180-ish CSV row splitter (quotes, doubled quotes, CRLF). */
function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

@Injectable()
export class BankService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sequences: DocumentSequenceService,
    private readonly finance: FinancialConfigurationService,
  ) {}

  /* ------------------------------ bank accounts ---------------------------- */

  async createBankAccount(principal: PurchasingPrincipal, dto: CreateBankAccount): Promise<BankAccountDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const acc = await ctx.query<{ id: string }>(
        `SELECT id FROM gl_account WHERE tenant_id = $1 AND code = $2 AND is_active AND is_posting`,
        [ctx.tenantId, dto.glAccountCode],
      );
      if (acc.rows.length === 0) throw new NotFoundError('gl_account (by code)', dto.glAccountCode);
      const glAccountId = acc.rows[0]!.id;
      let id: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO bank_account
             (tenant_id, code, bank_name, branch, account_name, account_number, currency, gl_account_id, opened_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [
            ctx.tenantId, dto.code, dto.bankName, dto.branch ?? null, dto.accountName,
            dto.accountNumber, dto.currency ?? 'GHS', glAccountId, dto.openedOn ?? null,
          ],
        );
        id = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') throw new ConflictError(`bank account code "${dto.code}" already exists`);
        throw err;
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'bank_account.created',
        entityType: 'bank_account',
        entityId: id,
        details: { code: dto.code, bankName: dto.bankName, glAccountCode: dto.glAccountCode },
      });
      return this.bankAccountDto(ctx, id);
    });
  }

  async listBankAccounts(tenantId: string): Promise<BankAccountDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<{ id: string }>(
        `SELECT id FROM bank_account WHERE tenant_id = $1 ORDER BY code`,
        [ctx.tenantId],
      );
      const out: BankAccountDto[] = [];
      for (const r of res.rows) out.push(await this.bankAccountDto(ctx, r.id));
      return out;
    });
  }

  async bankAccountDto(ctx: UowContext, id: string): Promise<BankAccountDto> {
    const b = await requireRow<Record<string, unknown>>(ctx, 'bank_account', id);
    const gl = await ctx.query<{ code: string; balance: string }>(
      `SELECT a.code,
         COALESCE((SELECT SUM(l.debit) - SUM(l.credit) FROM journal_line l WHERE l.account_id = a.id AND l.tenant_id = a.tenant_id), 0)::text AS balance
       FROM gl_account a WHERE a.id = $1`,
      [String(b.gl_account_id)],
    );
    return {
      id: String(b.id),
      code: String(b.code),
      bankName: String(b.bank_name),
      branch: b.branch ? String(b.branch) : null,
      accountName: String(b.account_name),
      accountNumber: String(b.account_number),
      currency: String(b.currency),
      glAccountId: String(b.gl_account_id),
      glAccountCode: gl.rows[0]?.code ?? null,
      isActive: Boolean(b.is_active),
      openedOn: dateColNull(b.opened_on),
      glBalance: gl.rows[0]?.balance ?? '0',
    };
  }

  /* -------------------------------- transfers ------------------------------ */

  async transfer(principal: PurchasingPrincipal, dto: BankTransferRequest): Promise<BankTransferDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      if (dto.fromBankAccountId === dto.toBankAccountId) {
        throw new ValidationError('source and destination bank accounts must differ');
      }
      const from = await requireRow<Record<string, unknown>>(ctx, 'bank_account', dto.fromBankAccountId);
      const to = await requireRow<Record<string, unknown>>(ctx, 'bank_account', dto.toBankAccountId);
      if (!Boolean(from.is_active) || !Boolean(to.is_active)) {
        throw new ConflictError('both bank accounts must be active');
      }
      const amount = parseMoney(dto.amount);
      const fee = parseMoney(dto.fee ?? '0');
      await this.finance.assertPeriodOpen(ctx, dto.businessDate);
      const code = await this.sequences.allocate(ctx, { docType: 'BANK_TRANSFER' });

      let id: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO bank_transfer
             (tenant_id, code, client_doc_id, from_bank_account_id, to_bank_account_id,
              business_date, amount, fee, reference, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            ctx.tenantId, code, dto.clientDocId ?? null, dto.fromBankAccountId, dto.toBankAccountId,
            dto.businessDate, formatMoney(amount), formatMoney(fee), dto.reference ?? null,
            dto.notes ?? null, principal.userId,
          ],
        );
        id = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') {
          throw new ConflictError(
            dto.clientDocId != null
              ? `duplicate bank transfer (client doc ${dto.clientDocId} already applied)`
              : `bank transfer code "${code}" already exists`,
          );
        }
        throw err;
      }

      // Dr destination (amount) + Dr bank fee / Cr source (amount + fee)
      await this.finance.postJournal(ctx, {
        sourceKind: 'bank_transfer',
        sourceId: id,
        event: 'transfer_posted',
        description: `Bank transfer ${code}`,
        businessDate: dto.businessDate,
        // prefer the human bank reference — it is what statement
        // matching compares against (fallback: the document code)
        reference: dto.reference ?? code,
        createdBy: principal.userId,
        lines: [
          { accountId: String(to.gl_account_id), debit: formatMoney(amount), memo: `transfer ${code} received` },
          ...(fee > 0n
            ? [
                {
                  accountId: (await this.finance.resolveGlAccounts(ctx, ['bank_fee_expense'])).get('bank_fee_expense')!,
                  debit: formatMoney(fee),
                  memo: `transfer ${code} fee`,
                },
              ]
            : []),
          { accountId: String(from.gl_account_id), credit: formatMoney(amount + fee), memo: `transfer ${code} sent` },
        ],
      });

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'bank_transfer.posted',
        entityType: 'bank_transfer',
        entityId: id,
        details: {
          code, from: String(from.code), to: String(to.code),
          amount: formatMoney(amount), fee: formatMoney(fee),
        },
      });
      await ctx.outbox.emit('BankTransferPosted', {
        bankTransferId: id, code, amount: formatMoney(amount), fee: formatMoney(fee),
      });
      return this.transferDto(ctx, id);
    });
  }

  async listTransfers(
    tenantId: string,
    filter: { limit?: number } = {},
  ): Promise<BankTransferDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const limit = Math.min(filter.limit ?? 100, 500);
      const res = await ctx.query<{ id: string }>(
        `SELECT id FROM bank_transfer WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT ${limit}`,
        [ctx.tenantId],
      );
      const out: BankTransferDto[] = [];
      for (const r of res.rows) out.push(await this.transferDto(ctx, r.id));
      return out;
    });
  }

  async transferDto(ctx: UowContext, id: string): Promise<BankTransferDto> {
    const t = await requireRow<Record<string, unknown>>(ctx, 'bank_transfer', id);
    const from = await ctx.query<{ code: string }>(`SELECT code FROM bank_account WHERE id = $1`, [String(t.from_bank_account_id)]);
    const to = await ctx.query<{ code: string }>(`SELECT code FROM bank_account WHERE id = $1`, [String(t.to_bank_account_id)]);
    return {
      id: String(t.id),
      code: String(t.code),
      fromBankAccountId: String(t.from_bank_account_id),
      fromAccountCode: from.rows[0]?.code ?? null,
      toBankAccountId: String(t.to_bank_account_id),
      toAccountCode: to.rows[0]?.code ?? null,
      businessDate: dateCol(t.business_date),
      amount: String(t.amount),
      fee: String(t.fee),
      reference: t.reference ? String(t.reference) : null,
      postedAt: new Date(t.posted_at as string).toISOString(),
    };
  }

  /* ------------------------------ statement import -------------------------- */

  /**
   * Imports a CSV bank statement. UNTRUSTED INPUT handling:
   *  - size bounded (5 MB / 20k lines);
   *  - strict per-field validation (dates, ±money, direction);
   *  - file sha256 dedupe per account + per-line identity dedupe;
   *  - all SQL parameterized; nothing from the file is ever interpolated.
   *
   * Expected header: value_date,transaction_date,reference,description,direction,amount,balance
   * (direction: debit = money left the bank; credit = money arrived)
   */
  async importStatement(
    principal: PurchasingPrincipal,
    args: { bankAccountId: string; filename: string; content: string; statementDate: string },
  ): Promise<BankStatementDto> {
    if (Buffer.byteLength(args.content, 'utf8') > MAX_STATEMENT_BYTES) {
      throw new ValidationError(`statement file exceeds the ${MAX_STATEMENT_BYTES / 1024 / 1024} MB bound`);
    }
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'bank_account', 'bank_account', [args.bankAccountId]);
      const bank = await requireRow<Record<string, unknown>>(ctx, 'bank_account', args.bankAccountId);

      const fileSha = sha256(args.content);
      const exists = await ctx.query<{ id: string }>(
        `SELECT id FROM bank_statement WHERE tenant_id = $1 AND bank_account_id = $2 AND file_sha256 = $3`,
        [ctx.tenantId, args.bankAccountId, fileSha],
      );
      if (exists.rows.length > 0) {
        throw new ConflictError(
          `this exact statement file was already imported for account ${String(bank.code)} (file fingerprint dedupe)`,
        );
      }

      // ---- parse (strict; a single bad row rejects the whole file) -----
      const rawLines = args.content.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (rawLines.length > MAX_STATEMENT_LINES) {
        throw new ValidationError(`statement exceeds the ${MAX_STATEMENT_LINES} line bound`);
      }
      const header = splitCsvRow(rawLines[0] ?? '').map((h) => h.toLowerCase());
      const required = ['value_date', 'direction', 'amount'];
      for (const r of required) {
        if (!header.includes(r)) {
          throw new ValidationError(
            `statement header must include ${required.join(', ')} (got: ${header.join(', ')})`,
          );
        }
      }
      const idx = (name: string) => header.indexOf(name);
      type ParsedLine = {
        valueDate: string; transactionDate: string | null; reference: string | null;
        description: string | null; direction: 'debit' | 'credit'; amount: string;
        closingBalance: string | null; fingerprint: string;
      };
      const parsed: ParsedLine[] = [];
      for (let i = 1; i < rawLines.length; i++) {
        const cells = splitCsvRow(rawLines[i]!);
        const valueDate = cells[idx('value_date')] ?? '';
        if (!DATE_RE.test(valueDate)) {
          throw new ValidationError(`line ${i + 1}: value_date "${valueDate}" is not yyyy-mm-dd`);
        }
        const direction = (cells[idx('direction')] ?? '').toLowerCase();
        if (direction !== 'debit' && direction !== 'credit') {
          throw new ValidationError(`line ${i + 1}: direction "${direction}" must be debit or credit`);
        }
        const amountRaw = (cells[idx('amount')] ?? '').replace(/,/g, '');
        if (!MONEY_RE.test(amountRaw) || parseMoney(amountRaw) <= 0n) {
          throw new ValidationError(`line ${i + 1}: amount "${amountRaw}" is not a positive decimal`);
        }
        const transactionDate = idx('transaction_date') >= 0 ? cells[idx('transaction_date')] ?? '' : '';
        if (transactionDate !== '' && !DATE_RE.test(transactionDate)) {
          throw new ValidationError(`line ${i + 1}: transaction_date "${transactionDate}" is not yyyy-mm-dd`);
        }
        const closing = idx('balance') >= 0 ? (cells[idx('balance')] ?? '').replace(/,/g, '') : '';
        if (closing !== '' && !MONEY_RE.test(closing)) {
          throw new ValidationError(`line ${i + 1}: balance "${closing}" is not a decimal`);
        }
        const reference = idx('reference') >= 0 ? cells[idx('reference')] ?? '' : '';
        const description = idx('description') >= 0 ? cells[idx('description')] ?? '' : '';
        parsed.push({
          valueDate,
          transactionDate: transactionDate || null,
          reference: reference || null,
          description: description || null,
          direction,
          amount: formatMoney(parseMoney(amountRaw)),
          closingBalance: closing === '' ? null : formatMoney(parseMoney(closing)),
          fingerprint: sha256(
            [valueDate, direction, formatMoney(parseMoney(amountRaw)), reference ?? '', description ?? ''].join('|'),
          ),
        });
      }

      const stmt = await ctx.query<{ id: string }>(
        `INSERT INTO bank_statement
           (tenant_id, bank_account_id, statement_date, filename, file_sha256, row_count, imported_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ctx.tenantId, args.bankAccountId, args.statementDate, args.filename, fileSha, parsed.length, principal.userId],
      );
      const statementId = stmt.rows[0]!.id;

      for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i]!;
        try {
          await ctx.query(
            `INSERT INTO bank_statement_line
               (tenant_id, bank_statement_id, bank_account_id, line_no, value_date, transaction_date,
                reference, description, direction, amount, closing_balance, line_fingerprint)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              ctx.tenantId, statementId, args.bankAccountId, i + 1, p.valueDate, p.transactionDate,
              p.reference, p.description, p.direction, p.amount, p.closingBalance, p.fingerprint,
            ],
          );
        } catch (err) {
          if (pgCode(err) === '23505') {
            throw new ConflictError(
              `line ${i + 2} (${p.valueDate} ${p.direction} ${p.amount}) was already imported for account ${String(bank.code)} — statement lines are deduplicated by (date, direction, amount, reference, description); genuinely identical sibling entries must be imported with a distinguishing reference`,
            );
          }
          throw err;
        }
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'bank_statement.imported',
        entityType: 'bank_statement',
        entityId: statementId,
        details: {
          bankAccountId: args.bankAccountId, filename: args.filename,
          fileSha256: fileSha, lineCount: parsed.length, statementDate: args.statementDate,
        },
      });
      await ctx.outbox.emit('BankStatementImported', {
        bankStatementId: statementId, bankAccountId: args.bankAccountId, lineCount: parsed.length,
      });
      return this.statementDto(ctx, statementId);
    });
  }

  async listStatements(tenantId: string, bankAccountId?: string): Promise<BankStatementDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 's.tenant_id = $1';
      if (bankAccountId) {
        params.push(bankAccountId);
        where += ` AND s.bank_account_id = $${params.length}`;
      }
      const res = await ctx.query<{ id: string }>(
        `SELECT s.id FROM bank_statement s WHERE ${where} ORDER BY s.imported_at DESC LIMIT 100`,
        params,
      );
      const out: BankStatementDto[] = [];
      for (const r of res.rows) out.push(await this.statementDto(ctx, r.id));
      return out;
    });
  }

  async statementDto(ctx: UowContext, statementId: string): Promise<BankStatementDto> {
    const s = await requireRow<Record<string, unknown>>(ctx, 'bank_statement', statementId);
    const bank = await ctx.query<{ code: string }>(
      `SELECT code FROM bank_account WHERE id = $1`, [String(s.bank_account_id)],
    );
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT l.*, COALESCE((SELECT SUM(bm.amount) FROM bank_match bm WHERE bm.bank_statement_line_id = l.id), 0)::numeric(18,4)::text AS matched_amount
       FROM bank_statement_line l WHERE l.bank_statement_id = $1 ORDER BY l.line_no`,
      [statementId],
    );
    const allMatches = await ctx.query<{ bank_statement_line_id: string; journal_line_id: string; amount: string }>(
      `SELECT bm.bank_statement_line_id::text AS bank_statement_line_id, bm.journal_line_id::text AS journal_line_id, bm.amount::text AS amount
       FROM bank_match bm JOIN bank_statement_line l ON l.id = bm.bank_statement_line_id
       WHERE l.bank_statement_id = $1`,
      [statementId],
    );
    const matchesByLine = new Map<string, Array<{ journalLineId: string; amount: string }>>();
    for (const m of allMatches.rows) {
      const list = matchesByLine.get(m.bank_statement_line_id) ?? [];
      list.push({ journalLineId: m.journal_line_id, amount: m.amount });
      matchesByLine.set(m.bank_statement_line_id, list);
    }
    return {
      id: String(s.id),
      bankAccountId: String(s.bank_account_id),
      bankAccountCode: bank.rows[0]?.code ?? null,
      statementDate: dateCol(s.statement_date),
      filename: String(s.filename),
      fileSha256: String(s.file_sha256),
      rowCount: Number(s.row_count),
      importedAt: new Date(s.imported_at as string).toISOString(),
      lines: lines.rows.map((l) => ({
        id: String(l.id),
        lineNo: Number(l.line_no),
        valueDate: dateCol(l.value_date),
        transactionDate: dateColNull(l.transaction_date),
        reference: l.reference ? String(l.reference) : null,
        description: l.description ? String(l.description) : null,
        direction: String(l.direction),
        amount: String(l.amount),
        closingBalance: l.closing_balance != null ? String(l.closing_balance) : null,
        matchStatus: String(l.match_status),
        matchedAmount: String(l.matched_amount),
        matches: matchesByLine.get(String(l.id)) ?? [],
      })),
    };
  }

  /* --------------------------------- matching ------------------------------- */

  /**
   * Deterministic match suggestions for one statement line: journal lines
   * on the SAME bank GL account with the OPPOSITE direction and the exact
   * remaining amount, ranked by reference equality then date proximity.
   * A suggestion is evidence for a human decision — it NEVER posts.
   */
  async suggestMatches(
    tenantId: string,
    statementLineId: string,
  ): Promise<BankMatchSuggestionDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const line = await requireRow<Record<string, unknown>>(ctx, 'bank_statement_line', statementLineId);
      const bank = await requireRow<Record<string, unknown>>(ctx, 'bank_account', String(line.bank_account_id));
      const direction = String(line.direction);
      const amount = parseMoney(String(line.amount));
      const matchedRes = await ctx.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS total FROM bank_match WHERE bank_statement_line_id = $1`,
        [statementLineId],
      );
      const remaining = amount - parseMoney(matchedRes.rows[0]!.total);
      if (remaining <= 0n) return [];

      // opposite-direction, same-account journal lines in a ±3-day window
      const candidates = await ctx.query<{
        id: string; debit: string; credit: string; reference: string | null;
        occurred_at: string; business_date: string | null; description: string | null;
        matched_amount: string;
      }>(
        `SELECT l.id, l.debit::text AS debit, l.credit::text AS credit, e.reference,
                e.occurred_at, e.business_date::text AS business_date, e.description,
                COALESCE((SELECT SUM(bm.amount) FROM bank_match bm WHERE bm.journal_line_id = l.id), 0)::text AS matched_amount
         FROM journal_line l
         JOIN journal_entry e ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
         WHERE l.tenant_id = $1 AND l.account_id = $2
           AND COALESCE(e.business_date, e.occurred_at::date) BETWEEN ($3::date - 3) AND ($3::date + 3)
         ORDER BY e.occurred_at DESC LIMIT 200`,
        [ctx.tenantId, String(bank.gl_account_id), dateCol(line.value_date)],
      );
      const out: BankMatchSuggestionDto[] = [];
      for (const c of candidates.rows) {
        const lineAmount = parseMoney(c.debit) > 0n ? parseMoney(c.debit) : parseMoney(c.credit);
        const available = lineAmount - parseMoney(c.matched_amount);
        if (available <= 0n) continue;
        const isDebitOnGl = parseMoney(c.debit) > 0n;
        // statement debit (money left) ↔ GL credit; statement credit ↔ GL debit
        if (direction === 'debit' ? isDebitOnGl : !isDebitOnGl) continue;
        const matchAmount = available >= remaining ? remaining : available;
        let confidence = 0.5;
        if (c.reference != null && line.reference != null && c.reference === line.reference) confidence += 0.4;
        const days = Math.abs(
          Date.parse(`${dateCol(c.business_date ?? c.occurred_at)}T00:00:00Z`) -
            Date.parse(`${dateCol(line.value_date)}T00:00:00Z`),
        ) / 86_400_000;
        confidence += Math.max(0, 0.1 - days * 0.02);
        out.push({
          statementLineId,
          journalLineId: c.id,
          journalReference: c.reference ?? (c.description ?? null),
          amount: formatMoney(matchAmount),
          ruleName: 'exact-amount-opposite-direction-3day-window',
          confidence: confidence.toFixed(4),
        });
      }
      return out.sort((a, b) => Number(b.confidence) - Number(a.confidence)).slice(0, 10);
    });
  }

  /** Manual match (split supported up to the line amount; DB guard). */
  async matchLine(
    principal: PurchasingPrincipal,
    args: { statementLineId: string; journalLineId: string; amount?: string },
  ): Promise<{ statementLineId: string; journalLineId: string; amount: string }> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const line = await requireRow<Record<string, unknown>>(ctx, 'bank_statement_line', args.statementLineId);
      const bank = await requireRow<Record<string, unknown>>(ctx, 'bank_account', String(line.bank_account_id));
      const jl = await requireRow<Record<string, unknown>>(ctx, 'journal_line', args.journalLineId);
      if (String(jl.account_id) !== String(bank.gl_account_id)) {
        throw new ValidationError('journal line belongs to a different GL account than the bank account');
      }
      const lineAmount = parseMoney(String(line.amount));
      const existing = await ctx.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS total FROM bank_match WHERE bank_statement_line_id = $1`,
        [args.statementLineId],
      );
      const alreadyMatched = parseMoney(existing.rows[0]!.total);
      const amount = parseMoney(args.amount ?? String(line.amount));
      if (amount <= 0n || alreadyMatched + amount > lineAmount) {
        throw new ValidationError(
          `match amount must be positive and fit the remaining line value (${formatMoney(lineAmount - alreadyMatched)})`,
        );
      }
      // direction must be opposite
      const statementIsDebit = String(line.direction) === 'debit';
      const glIsDebit = parseMoney(String(jl.debit)) > 0n;
      if (statementIsDebit === glIsDebit) {
        throw new ValidationError('a statement debit matches a GL credit (and vice versa) — directions must be opposite');
      }
      try {
        await ctx.query(
          `INSERT INTO bank_match (tenant_id, bank_statement_line_id, journal_line_id, amount, method, matched_by)
           VALUES ($1,$2,$3,$4,'manual',$5)`,
          [ctx.tenantId, args.statementLineId, args.journalLineId, formatMoney(amount), principal.userId],
        );
      } catch (err) {
        if (pgCode(err) === '23505') throw new ConflictError('this statement line is already matched to this journal line');
        throw err;
      }
      await ctx.query(
        `UPDATE bank_statement_line SET match_status = 'matched' WHERE id = $1 AND tenant_id = $2`,
        [args.statementLineId, ctx.tenantId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'bank_match.created',
        entityType: 'bank_match',
        entityId: `${args.statementLineId}:${args.journalLineId}`,
        details: { amount: formatMoney(amount), method: 'manual' },
      });
      return { statementLineId: args.statementLineId, journalLineId: args.journalLineId, amount: formatMoney(amount) };
    });
  }

  async unmatchLine(
    principal: PurchasingPrincipal,
    statementLineId: string,
    journalLineId: string,
  ): Promise<{ statementLineId: string; unmatched: number }> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const res = await ctx.query(
        `DELETE FROM bank_match WHERE bank_statement_line_id = $1 AND journal_line_id = $2 AND tenant_id = $3`,
        [statementLineId, journalLineId, ctx.tenantId],
      );
      if (res.rowCount === 0) throw new NotFoundError('bank_match', `${statementLineId}/${journalLineId}`);
      const remaining = await ctx.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM bank_match WHERE bank_statement_line_id = $1`,
        [statementLineId],
      );
      if (remaining.rows[0]!.n === '0') {
        await ctx.query(
          `UPDATE bank_statement_line SET match_status = 'unmatched' WHERE id = $1 AND tenant_id = $2`,
          [statementLineId, ctx.tenantId],
        );
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'bank_match.removed',
        entityType: 'bank_match',
        entityId: `${statementLineId}:${journalLineId}`,
        details: {},
      });
      return { statementLineId, unmatched: res.rowCount ?? 0 };
    });
  }

  /* ------------------------------ reconciliation ---------------------------- */

  /** Finalizes a reconciliation: records the GL balance, the statement
   *  closing balance and their difference — explicit, never a plug. */
  async finalizeReconciliation(
    principal: PurchasingPrincipal,
    args: { bankAccountId: string; asOf: string; notes?: string },
  ): Promise<BankReconciliationDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'bank_account', 'bank_account', [args.bankAccountId]);
      const bank = await requireRow<Record<string, unknown>>(ctx, 'bank_account', args.bankAccountId);
      const glBalance = await ctx.query<{ balance: string }>(
        `SELECT COALESCE(SUM(l.debit) - SUM(l.credit), 0)::text AS balance
         FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
         WHERE l.tenant_id = $1 AND l.account_id = $2
           AND COALESCE(e.business_date, e.occurred_at::date) <= $3::date`,
        [ctx.tenantId, String(bank.gl_account_id), args.asOf],
      );
      const stmtBalance = await ctx.query<{ balance: string | null }>(
        `SELECT (SELECT closing_balance FROM bank_statement_line
           WHERE bank_account_id = $1 AND closing_balance IS NOT NULL AND value_date <= $2::date
           ORDER BY value_date DESC, line_no DESC LIMIT 1)::text AS balance`,
        [args.bankAccountId, args.asOf],
      );
      const gl = parseMoney(glBalance.rows[0]!.balance);
      const stmt = stmtBalance.rows[0]?.balance != null ? parseMoney(stmtBalance.rows[0]!.balance) : null;
      const res = await ctx.query<{ id: string }>(
        `INSERT INTO bank_reconciliation
           (tenant_id, bank_account_id, as_of, statement_closing_balance, gl_closing_balance, difference, status, notes, created_by, finalized_at, finalized_by)
         VALUES ($1,$2,$3,$4,$5,$6,'finalized',$7,$8,now(),$8) RETURNING id`,
        [
          ctx.tenantId, args.bankAccountId, args.asOf,
          stmt != null ? formatMoney(stmt) : null, formatMoney(gl),
          formatMoney(stmt != null ? gl - stmt : 0n),
          args.notes ?? null, principal.userId,
        ],
      );
      const id = res.rows[0]!.id;
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'bank_reconciliation.finalized',
        entityType: 'bank_reconciliation',
        entityId: id,
        details: {
          bankAccountId: args.bankAccountId, asOf: args.asOf,
          glBalance: formatMoney(gl), statementBalance: stmt != null ? formatMoney(stmt) : null,
        },
      });
      await ctx.outbox.emit('BankReconciliationFinalized', { bankReconciliationId: id, asOf: args.asOf });
      return this.reconciliationDto(ctx, id);
    });
  }

  async listReconciliations(tenantId: string, bankAccountId?: string): Promise<BankReconciliationDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'r.tenant_id = $1';
      if (bankAccountId) {
        params.push(bankAccountId);
        where += ` AND r.bank_account_id = $${params.length}`;
      }
      const res = await ctx.query<{ id: string }>(
        `SELECT r.id FROM bank_reconciliation r WHERE ${where} ORDER BY r.as_of DESC LIMIT 100`,
        params,
      );
      const out: BankReconciliationDto[] = [];
      for (const r of res.rows) out.push(await this.reconciliationDto(ctx, r.id));
      return out;
    });
  }

  async reconciliationDto(ctx: UowContext, id: string): Promise<BankReconciliationDto> {
    const r = await requireRow<Record<string, unknown>>(ctx, 'bank_reconciliation', id);
    const bank = await ctx.query<{ code: string }>(
      `SELECT code FROM bank_account WHERE id = $1`, [String(r.bank_account_id)],
    );
    return {
      id: String(r.id),
      bankAccountId: String(r.bank_account_id),
      bankAccountCode: bank.rows[0]?.code ?? null,
      asOf: dateCol(r.as_of),
      statementClosingBalance: r.statement_closing_balance != null ? String(r.statement_closing_balance) : null,
      glClosingBalance: String(r.gl_closing_balance),
      difference: String(r.difference),
      status: String(r.status),
      finalizedAt: r.finalized_at ? new Date(r.finalized_at as string).toISOString() : null,
    };
  }
}
