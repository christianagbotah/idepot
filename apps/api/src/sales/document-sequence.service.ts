import { Injectable } from '@nestjs/common';
import type { BookletDto, BookletCodeDto, DocumentSequenceDto, ImportBooklet, IssueLease, SequenceLeaseDto, SpoilCode } from '@idepot/contracts';
import { ConflictError, NotFoundError, ValidationError } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
import { assertTenantRef } from '../inventory/inventory-refs.js';

/** Postgres SQLSTATE of a driver error, when present. */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

export type SequenceDocType = 'QUOTATION' | 'SALE_ORDER' | 'INVOICE' | 'RECEIPT' | 'WAYBILL' | 'DEPOSIT';

const DEFAULT_PREFIX: Record<SequenceDocType, string> = {
  QUOTATION: 'QT',
  SALE_ORDER: 'SO',
  INVOICE: 'INV',
  RECEIPT: 'RCT',
  WAYBILL: 'WB',
  DEPOSIT: 'DEP',
};

const DEFAULT_PADDING: Record<SequenceDocType, number> = {
  QUOTATION: 5,
  SALE_ORDER: 5,
  INVOICE: 5,
  RECEIPT: 5,
  WAYBILL: 5,
  DEPOSIT: 5,
};

export interface SequencePrincipal {
  userId: string;
  tenantId: string;
  displayName: string;
}

export interface AllocationOptions {
  docType: SequenceDocType;
  branchId?: string | null;
  /** A pre-allocated number from an offline device lease (validated below). */
  preallocated?: string | null;
  deviceId?: string | null;
}

/**
 * Document numbering (document-numbering §5 corrected model).
 *
 * - Counter sequences: ONE row-locked UPDATE … RETURNING per allocation —
 *   two cashiers can never observe the same number (legacy R6 race killed).
 * - Booklets: pre-printed codes (imported or generated) allocated IN ORDER
 *   under FOR UPDATE — the legacy read-then-use race (two cashiers both
 *   passing verify before either closes the row) is structurally impossible.
 * - Spoilage ('not used' + mandatory reason ≥ 10 chars) is preserved as a
 *   first-class workflow; every transition is audited.
 * - Leases: contiguous ranges for offline devices, expiry-bounded; the sync
 *   apply path validates an offline number against the issuing lease.
 *
 * Invoice/waybill numbering prefers OPEN BOOKLET CODES (pre-printed stock is
 * a physical constraint) and falls back to the counter sequence when no
 * booklet stock exists.
 */
@Injectable()
export class DocumentSequenceService {
  constructor(private readonly uow: UnitOfWork) {}

  /** Allocate the next human document code inside the open UoW transaction. */
  async allocate(ctx: UowContext, opts: AllocationOptions): Promise<string> {
    if (opts.preallocated != null && opts.preallocated !== '') {
      await this.validatePreallocated(ctx, opts);
      return opts.preallocated;
    }
    if (opts.docType === 'INVOICE' || opts.docType === 'WAYBILL') {
      const bookletCode = await this.allocateFromBooklet(ctx, opts.docType);
      if (bookletCode) return bookletCode;
    }
    return this.allocateFromCounter(ctx, opts.docType, opts.branchId ?? null);
  }

  /** Atomic counter allocation: row-locked UPDATE, then format. */
  async allocateFromCounter(
    ctx: UowContext,
    docType: SequenceDocType,
    branchId: string | null,
  ): Promise<string> {
    await this.ensureSequence(ctx, docType, branchId);
    const res = await ctx.query<{ prefix: string; padding: number; allocated: string }>(
      `UPDATE document_sequence
       SET next_value = next_value + 1
       WHERE tenant_id = $1 AND doc_type = $2 AND branch_id IS NOT DISTINCT FROM $3
       RETURNING prefix, padding, (next_value - 1)::text AS allocated`,
      [ctx.tenantId, docType, branchId],
    );
    const row = res.rows[0]!;
    return `${row.prefix}${String(row.allocated).padStart(row.padding, '0')}`;
  }

  /**
   * Lowest open booklet code, allocated under row lock. READ COMMITTED
   * re-evaluates the `status='open'` predicate when a concurrent allocator
   * commits between our scan and our lock, so two cashiers get different
   * codes with no retry loop.
   */
  private async allocateFromBooklet(ctx: UowContext, docType: 'INVOICE' | 'WAYBILL'): Promise<string | null> {
    const res = await ctx.query<{ id: string; code: string }>(
      `SELECT c.id, c.code
       FROM document_booklet_code c
       JOIN document_booklet b ON b.id = c.booklet_id
       WHERE c.tenant_id = $1 AND b.doc_type = $2 AND c.status = 'open'
       ORDER BY b.created_at, c.seq
       LIMIT 1
       FOR UPDATE OF c`,
      [ctx.tenantId, docType],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0]!;
    await ctx.query(
      `UPDATE document_booklet_code
       SET status = 'allocated', allocated_by = $3, allocated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [row.id, ctx.tenantId, ctx.userId],
    );
    return row.code;
  }

  /** Offline number must fall inside an unexpired lease of THIS device. */
  private async validatePreallocated(ctx: UowContext, opts: AllocationOptions): Promise<void> {
    const number = opts.preallocated!;
    const m = /^(.*?)(\d+)$/.exec(number);
    if (!m) {
      throw new ValidationError(`offline document number "${number}" is not a prefixed number`);
    }
    const prefix = m[1]!;
    const value = m[2]!;
    const res = await ctx.query<{ id: string }>(
      `SELECT l.id FROM sequence_lease l
       WHERE l.tenant_id = $1 AND l.device_id = $2 AND l.doc_type = $3
         AND l.prefix = $4
         AND l.start_value <= $5::bigint AND l.end_value >= $5::bigint
         AND l.expires_at > now()`,
      [ctx.tenantId, opts.deviceId, opts.docType, prefix, value],
    );
    if (res.rows.length === 0) {
      throw new ValidationError(
        `offline document number "${number}" is not covered by an unexpired lease of this device (${opts.docType})`,
      );
    }
  }

  private async ensureSequence(ctx: UowContext, docType: SequenceDocType, branchId: string | null): Promise<void> {
    await ctx.query(
      `INSERT INTO document_sequence (tenant_id, doc_type, branch_id, prefix, next_value, padding)
       VALUES ($1,$2,$3,$4,1,$5)
       ON CONFLICT (tenant_id, doc_type, branch_id) DO NOTHING`,
      [ctx.tenantId, docType, branchId, DEFAULT_PREFIX[docType], DEFAULT_PADDING[docType]],
    );
  }

  /* ------------------------------ management ------------------------------ */

  createSequence(principal: SequencePrincipal, dto: { docType: SequenceDocType; prefix: string; branchId?: string | null; padding?: number }): Promise<DocumentSequenceDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      try {
        const res = await ctx.query<Record<string, unknown>>(
          `INSERT INTO document_sequence (tenant_id, doc_type, branch_id, prefix, padding)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id, doc_type, branch_id, prefix, next_value, padding`,
          [ctx.tenantId, dto.docType, dto.branchId ?? null, dto.prefix, dto.padding ?? DEFAULT_PADDING[dto.docType]],
        );
        const row = res.rows[0]!;
        await ctx.audit.record({
          tenantId: ctx.tenantId,
          actorUserId: principal.userId,
          actorDisplay: principal.displayName,
          action: 'document_sequence.created',
          entityType: 'document_sequence',
          entityId: String(row.id),
          details: { docType: dto.docType, prefix: dto.prefix, branchId: dto.branchId ?? null },
        });
        return this.sequenceToDto(row);
      } catch (err) {
        if (pgCode(err) === '23505') throw new ConflictError('sequence already exists for this doc type/branch');
        throw err;
      }
    });
  }

  listSequences(tenantId: string): Promise<DocumentSequenceDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const r = await ctx.query<Record<string, unknown>>(
        `SELECT id, doc_type, branch_id, prefix, next_value, padding
         FROM document_sequence ORDER BY doc_type, branch_id NULLS FIRST`,
      );
      return r.rows.map((row) => this.sequenceToDto(row));
    });
  }

  importBooklet(principal: SequencePrincipal, dto: ImportBooklet): Promise<BookletDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const seen = new Set<string>();
      for (const c of dto.codes) {
        if (seen.has(c)) throw new ValidationError(`duplicate code "${c}" in booklet import`);
        seen.add(c);
      }
      const bookletRes = await ctx.query<{ id: string }>(
        `INSERT INTO document_booklet (tenant_id, doc_type, code_range, source, created_by)
         VALUES ($1,$2,$3,'imported',$4) RETURNING id`,
        [ctx.tenantId, dto.docType, dto.codeRange ?? null, principal.userId],
      );
      const bookletId = bookletRes.rows[0]!.id;
      try {
        for (let i = 0; i < dto.codes.length; i++) {
          await ctx.query(
            `INSERT INTO document_booklet_code (tenant_id, booklet_id, seq, code)
             VALUES ($1,$2,$3,$4)`,
            [ctx.tenantId, bookletId, i + 1, dto.codes[i]!],
          );
        }
      } catch (err) {
        if (pgCode(err) === '23505') {
          throw new ConflictError('one or more booklet codes already exist for this tenant (codes are kept unique — legacy booklet numbers are verbatim evidence)');
        }
        throw err;
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'document_booklet.imported',
        entityType: 'document_booklet',
        entityId: bookletId,
        details: { docType: dto.docType, codeRange: dto.codeRange ?? null, count: dto.codes.length },
      });
      await ctx.outbox.emit('BookletImported', { bookletId, docType: dto.docType, count: dto.codes.length });
      return this.bookletToDto(ctx, bookletId);
    });
  }

  getBooklet(tenantId: string, bookletId: string): Promise<BookletDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.bookletToDto(ctx, bookletId));
  }

  private async bookletToDto(ctx: UowContext, bookletId: string): Promise<BookletDto> {
    const head = await ctx.query<Record<string, unknown>>(
      `SELECT b.id, b.doc_type, b.code_range, b.created_by, b.created_at,
              count(c.id)::int AS code_count,
              count(c.id) FILTER (WHERE c.status = 'open')::int AS open_count
       FROM document_booklet b
       LEFT JOIN document_booklet_code c ON c.booklet_id = b.id
       WHERE b.id = $1 AND b.tenant_id = $2
       GROUP BY b.id`,
      [bookletId, ctx.tenantId],
    );
    if (head.rows.length === 0) throw new NotFoundError('booklet', bookletId);
    const r = head.rows[0]!;
    return {
      id: String(r.id),
      docType: String(r.doc_type),
      codeRange: r.code_range ? String(r.code_range) : null,
      codeCount: Number(r.code_count),
      openCount: Number(r.open_count),
      createdBy: r.created_by ? String(r.created_by) : null,
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }

  listBookletCodes(tenantId: string, bookletId: string): Promise<BookletCodeDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT id, booklet_id, code, status, reason
         FROM document_booklet_code WHERE booklet_id = $1 ORDER BY seq`,
        [bookletId],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        bookletId: String(r.booklet_id),
        code: String(r.code),
        status: String(r.status) as BookletCodeDto['status'],
        reason: r.reason ? String(r.reason) : null,
      }));
    });
  }

  /** Booklet spoilage: 'not used' + mandatory reason ≥ 10 chars (legacy
   *  invoiceReasonUpdator behaviour, race-free, audited). */
  spoilCode(principal: SequencePrincipal, codeId: string, dto: SpoilCode): Promise<BookletCodeDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const res = await ctx.query<Record<string, unknown>>(
        `UPDATE document_booklet_code
         SET status = 'not_used', reason = $3
         WHERE id = $1 AND tenant_id = $2 AND status = 'open'
         RETURNING id, booklet_id, code, status, reason`,
        [codeId, ctx.tenantId, dto.reason],
      );
      if (res.rows.length === 0) {
        throw new ConflictError('booklet code is not open (already allocated or spoiled)');
      }
      const row = res.rows[0]!;
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'document_booklet_code.spoiled',
        entityType: 'document_booklet_code',
        entityId: String(row.id),
        details: { code: String(row.code), reason: dto.reason },
      });
      return {
        id: String(row.id),
        bookletId: String(row.booklet_id),
        code: String(row.code),
        status: 'not_used',
        reason: String(row.reason),
      };
    });
  }

  /** Lease a contiguous range to an offline device (offline-sync §3). */
  issueLease(principal: SequencePrincipal, dto: IssueLease): Promise<SequenceLeaseDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRef(ctx, 'device', 'device', dto.deviceId);
      const size = dto.size ?? 100;
      await this.ensureSequence(ctx, dto.docType, null);
      // atomic carve: advance the counter by the lease size in one UPDATE
      const res = await ctx.query<{ prefix: string; start: string; end: string }>(
        `UPDATE document_sequence
         SET next_value = next_value + $3
         WHERE tenant_id = $1 AND doc_type = $2 AND branch_id IS NULL
         RETURNING prefix, (next_value - $3)::text AS start, (next_value - 1)::text AS end`,
        [ctx.tenantId, dto.docType, size],
      );
      const row = res.rows[0]!;
      // leases expire after 7 days; a device may renew before going offline —
      // expired or consumed leases stay for audit/reconciliation
      const leaseRes = await ctx.query<Record<string, unknown>>(
        `INSERT INTO sequence_lease
           (tenant_id, device_id, doc_type, sequence_id, prefix, start_value, end_value, expires_at)
         VALUES ($1,$2,$3,
           (SELECT id FROM document_sequence WHERE tenant_id = $1 AND doc_type = $2 AND branch_id IS NULL),
           $4,$5::bigint,$6::bigint, now() + interval '7 days')
         RETURNING id, device_id, doc_type, prefix, start_value, end_value, issued_at, expires_at`,
        [ctx.tenantId, dto.deviceId, dto.docType, row.prefix, row.start, row.end],
      );
      const l = leaseRes.rows[0]!;
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'sequence_lease.issued',
        entityType: 'sequence_lease',
        entityId: String(l.id),
        details: { deviceId: dto.deviceId, docType: dto.docType, start: row.start, end: row.end },
      });
      return {
        id: String(l.id),
        deviceId: String(l.device_id),
        docType: String(l.doc_type),
        prefix: String(l.prefix),
        startValue: Number(l.start_value),
        endValue: Number(l.end_value),
        issuedAt: new Date(l.issued_at as string).toISOString(),
        expiresAt: new Date(l.expires_at as string).toISOString(),
      };
    });
  }

  listLeases(tenantId: string): Promise<SequenceLeaseDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT id, device_id, doc_type, prefix, start_value, end_value, issued_at, expires_at
         FROM sequence_lease ORDER BY issued_at DESC LIMIT 200`,
      );
      return res.rows.map((l) => ({
        id: String(l.id),
        deviceId: String(l.device_id),
        docType: String(l.doc_type),
        prefix: String(l.prefix),
        startValue: Number(l.start_value),
        endValue: Number(l.end_value),
        issuedAt: new Date(l.issued_at as string).toISOString(),
        expiresAt: new Date(l.expires_at as string).toISOString(),
      }));
    });
  }

  private sequenceToDto(r: Record<string, unknown>): DocumentSequenceDto {
    return {
      id: String(r.id),
      docType: String(r.doc_type),
      prefix: String(r.prefix),
      branchId: r.branch_id ? String(r.branch_id) : null,
      nextValue: Number(r.next_value),
      padding: Number(r.padding),
    };
  }
}
