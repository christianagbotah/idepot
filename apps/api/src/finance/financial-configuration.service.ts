import { Injectable } from '@nestjs/common';
import type {
  CreateTaxProfile,
  CreateTaxVersion,
  JournalEntryDto,
  TaxProfileDto,
  TaxProfileVersionDto,
} from '@idepot/contracts';
import { verifyPassword, hasPermission, type Permission } from '@idepot/auth';
import {
  JournalBuilder,
  ConflictError,
  NotFoundError,
  ValidationError,
  parseMoney,
  parseTaxRate,
  type GlPurpose,
  type JournalLineSpec,
  type TaxComponentRule,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';

/** Postgres SQLSTATE of a driver error, when present (23505 unique, P0001 raise). */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Financial configuration + evidence services (Phase 3 hardening, review
 * findings #1/#2/#3/#4).
 *
 * Everything here runs INSIDE the caller's UnitOfWork transaction: tax is
 * resolved and evidenced at sale time, GL journals commit with their source
 * document, cost policy is resolved per transaction date, and override
 * approvals are verified against the tenant's own user table. Nothing is
 * cached across transactions — configuration is read under the posting
 * transaction's snapshot.
 *
 * The engine is STATUTE-FREE: no statutory tax rate, name or threshold is
 * embedded anywhere. Defaults provision a NEUTRAL configuration (a default
 * profile with ZERO components, an AVCO cost policy, a generic control
 * chart); tenants configure real components through the admin API.
 */
@Injectable()
export class FinancialConfigurationService {
  /** The generic control chart seeded per tenant (codes are configuration
   *  seeds, not statutory facts; every purpose maps to exactly one account). */
  private static readonly CONTROL_CHART: ReadonlyArray<{
    purpose: GlPurpose;
    code: string;
    name: string;
    type: 'asset' | 'liability' | 'revenue' | 'expense';
  }> = [
    { purpose: 'cash', code: '1000', name: 'Cash on Hand', type: 'asset' },
    { purpose: 'bank_clearing', code: '1010', name: 'Bank Clearing', type: 'asset' },
    { purpose: 'momo_clearing', code: '1020', name: 'Mobile Money Clearing', type: 'asset' },
    { purpose: 'cheque_clearing', code: '1030', name: 'Cheques in Transit', type: 'asset' },
    { purpose: 'accounts_receivable', code: '1100', name: 'Accounts Receivable', type: 'asset' },
    { purpose: 'inventory', code: '1200', name: 'Inventory', type: 'asset' },
    { purpose: 'customer_deposit_liability', code: '2100', name: 'Customer Deposits', type: 'liability' },
    { purpose: 'tax_payable', code: '2200', name: 'Tax Payable', type: 'liability' },
    { purpose: 'sales_revenue', code: '4000', name: 'Sales Revenue', type: 'revenue' },
    { purpose: 'cogs', code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
  ];

  constructor(private readonly uow: UnitOfWork) {}

  /**
   * Idempotent provisioning of the NEUTRAL financial defaults inside the
   * open posting transaction: control chart + purpose mappings, an AVCO
   * cost-policy version effective forever, and a default tax profile with
   * ZERO components (tax-neutral until the tenant configures real ones).
   * One guard query per posting; the INSERTs race safely on the unique
   * constraints (a concurrent first-posting provisions the same rows).
   */
  async ensureDefaults(ctx: UowContext): Promise<void> {
    const guard = await ctx.query<{ mappings: string; cost_versions: string; tax_profiles: string }>(
      `SELECT
         (SELECT count(*) FROM gl_mapping WHERE tenant_id = $1)::text AS mappings,
         (SELECT count(*) FROM cost_policy_version WHERE tenant_id = $1)::text AS cost_versions,
         (SELECT count(*) FROM tax_profile WHERE tenant_id = $1)::text AS tax_profiles`,
      [ctx.tenantId],
    );
    const g = guard.rows[0]!;

    if (g.mappings !== '10') {
      for (const acc of FinancialConfigurationService.CONTROL_CHART) {
        await ctx.query(
          `INSERT INTO gl_account (tenant_id, code, name, account_type)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (tenant_id, code) DO NOTHING`,
          [ctx.tenantId, acc.code, acc.name, acc.type],
        );
      }
      await ctx.query(
        `INSERT INTO gl_mapping (tenant_id, purpose, account_id)
         SELECT $1, c.purpose, a.id
           FROM (VALUES
             ${FinancialConfigurationService.CONTROL_CHART.map((c) => `('${c.purpose}','${c.code}')`).join(',')}
           ) AS c(purpose, code)
           JOIN gl_account a ON a.tenant_id = $1 AND a.code = c.code
         ON CONFLICT (tenant_id, purpose) DO NOTHING`,
        [ctx.tenantId],
      );
    }

    if (g.cost_versions === '0') {
      await ctx.query(
        `INSERT INTO cost_policy_version (tenant_id, version, method, effective_from, note)
         VALUES ($1, 1, 'avco', '1970-01-01', 'ADR-0004 default: weighted-average cost')
         ON CONFLICT (tenant_id, version) DO NOTHING`,
        [ctx.tenantId],
      );
    }

    if (g.tax_profiles === '0') {
      const profile = await ctx.query<{ id: string }>(
        `INSERT INTO tax_profile (tenant_id, code, name, is_default)
         VALUES ($1, 'DEFAULT', 'Standard', true)
         ON CONFLICT (tenant_id, code) DO NOTHING
         RETURNING id`,
        [ctx.tenantId],
      );
      const profileId =
        profile.rows[0]?.id ??
        (
          await ctx.query<{ id: string }>(
            `SELECT id FROM tax_profile WHERE tenant_id = $1 AND code = 'DEFAULT'`,
            [ctx.tenantId],
          )
        ).rows[0]!.id;
      await ctx.query(
        `INSERT INTO tax_profile_version (tenant_id, profile_id, version, effective_from, note)
         VALUES ($1, $2, 1, '1970-01-01', 'tax-neutral default: no components until configured')
         ON CONFLICT (profile_id, version) DO NOTHING`,
        [ctx.tenantId, profileId],
      );
    }
  }

  /* --------------------------------- tax ---------------------------------- */

  /** Resolves the tenant's default tax profile version effective at the
   *  transaction date, SERVER-SIDE (the client never names a version). */
  async resolveTaxRules(
    ctx: UowContext,
    businessDate: string,
  ): Promise<{ versionId: string | null; profileCode: string | null; rules: TaxComponentRule[] }> {
    const version = await this.effectiveTaxVersion(ctx, businessDate);
    if (!version) return { versionId: null, profileCode: null, rules: [] };
    const comps = await ctx.query<{
      id: string;
      name: string;
      rate: string;
      inclusive: boolean;
      seq: number;
    }>(
      `SELECT id, name, rate::text AS rate, inclusive, seq
       FROM tax_component WHERE version_id = $1
       ORDER BY seq, name`,
      [version.versionId],
    );
    const rules: TaxComponentRule[] = comps.rows.map((c) => ({
      componentId: c.id,
      name: c.name,
      rate: c.rate,
      inclusive: c.inclusive,
      seq: c.seq,
    }));
    // validate every configured rate now — a bad configuration fails the
    // posting LOUD, never silently computes
    for (const r of rules) parseTaxRate(r.rate);
    return { versionId: version.versionId, profileCode: version.profileCode, rules };
  }

  private async effectiveTaxVersion(
    ctx: UowContext,
    businessDate: string,
  ): Promise<{ versionId: string; profileCode: string } | null> {
    const res = await this.queryEffectiveTaxVersion(ctx, businessDate);
    if (res.rows.length > 0) {
      return { versionId: res.rows[0]!.version_id, profileCode: res.rows[0]!.profile_code };
    }
    // no effective version at all — provision the neutral defaults once and
    // retry (a tenant that never configures tax still posts tax-neutral)
    await this.ensureDefaults(ctx);
    const retry = await this.queryEffectiveTaxVersion(ctx, businessDate);
    return retry.rows[0] ? { versionId: retry.rows[0]!.version_id, profileCode: retry.rows[0]!.profile_code } : null;
  }

  private queryEffectiveTaxVersion(ctx: UowContext, businessDate: string) {
    return ctx.query<{ version_id: string; profile_code: string }>(
      `SELECT v.id AS version_id, p.code AS profile_code
       FROM tax_profile p
       JOIN tax_profile_version v ON v.profile_id = p.id
       WHERE p.tenant_id = $1 AND p.is_default AND p.is_active
         AND v.effective_from <= $2::date
         AND (v.effective_to IS NULL OR v.effective_to >= $2::date)
       ORDER BY v.effective_from DESC, v.version DESC
       LIMIT 1`,
      [ctx.tenantId, businessDate],
    );
  }

  /** List the tenant's profiles with versions + components (admin read). */
  async listTaxProfiles(tenantId: string): Promise<TaxProfileDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => this.listTaxProfilesInCtx(ctx));
  }

  private async listTaxProfilesInCtx(ctx: UowContext): Promise<TaxProfileDto[]> {
    const profiles = await ctx.query<{ id: string; code: string; name: string; is_active: boolean; is_default: boolean }>(
      `SELECT id, code, name, is_active, is_default FROM tax_profile
       WHERE tenant_id = $1 ORDER BY code`,
      [ctx.tenantId],
    );
    const versions = await ctx.query<{
      id: string; profile_id: string; version: number;
      effective_from: string; effective_to: string | null; note: string | null;
    }>(
      `SELECT id, profile_id, version, effective_from::text AS effective_from,
              effective_to::text AS effective_to, note
       FROM tax_profile_version WHERE tenant_id = $1
       ORDER BY profile_id, version`,
      [ctx.tenantId],
    );
    const components = await ctx.query<{
      id: string; version_id: string; name: string; rate: string;
      inclusive: boolean; seq: number; gl_account_id: string | null;
    }>(
      `SELECT c.id, c.version_id, c.name, c.rate::text AS rate, c.inclusive, c.seq, c.gl_account_id
       FROM tax_component c WHERE c.tenant_id = $1
       ORDER BY c.version_id, c.seq, c.name`,
      [ctx.tenantId],
    );
    const accountCodes = await this.accountCodeMap(ctx);
    const byVersion = new Map<string, TaxProfileVersionDto['components']>();
    for (const c of components.rows) {
      const list = byVersion.get(c.version_id) ?? [];
      list.push({
        id: c.id,
        name: c.name,
        rate: c.rate,
        inclusive: c.inclusive,
        seq: c.seq,
        glAccountCode: c.gl_account_id ? (accountCodes.get(c.gl_account_id) ?? null) : null,
      });
      byVersion.set(c.version_id, list);
    }
    return profiles.rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      isActive: p.is_active,
      isDefault: p.is_default,
      versions: versions.rows
        .filter((v) => v.profile_id === p.id)
        .map((v) => ({
          id: v.id,
          version: v.version,
          effectiveFrom: v.effective_from,
          effectiveTo: v.effective_to,
          note: v.note,
          components: byVersion.get(v.id) ?? [],
        })),
    }));
  }

  /** Creates a tax profile (configuration container). */
  async createTaxProfile(
    principal: { tenantId: string; userId: string; displayName: string },
    dto: CreateTaxProfile,
  ): Promise<TaxProfileDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      // a tenant has at most ONE default profile (partial unique index):
      // clear the flag BEFORE the insert — the insert itself must not race
      // the index
      if (dto.isDefault) {
        await ctx.query(
          `UPDATE tax_profile SET is_default = false WHERE tenant_id = $1 AND is_default`,
          [ctx.tenantId],
        );
      }
      let id: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO tax_profile (tenant_id, code, name, is_default)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [ctx.tenantId, dto.code, dto.name, dto.isDefault ?? false],
        );
        id = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') throw new ConflictError(`tax profile code "${dto.code}" already exists`);
        throw err;
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'tax.profile.created',
        entityType: 'tax_profile',
        entityId: id,
        details: { code: dto.code, name: dto.name, isDefault: dto.isDefault ?? false },
      });
      return (await this.listTaxProfilesInCtx(ctx)).find((p) => p.id === id)!;
    });
  }

  /**
   * Creates an immutable version with named components — the ONLY lawful way
   * rates change (an in-place edit of a live version is structurally
   * rejected by the append-only grant + overlap guard).
   */
  async createTaxVersion(
    principal: { tenantId: string; userId: string; displayName: string },
    profileId: string,
    dto: CreateTaxVersion,
  ): Promise<TaxProfileVersionDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const profile = await ctx.query<{ id: string; code: string }>(
        `SELECT id, code FROM tax_profile WHERE id = $1 AND tenant_id = $2`,
        [profileId, ctx.tenantId],
      );
      if (profile.rows.length === 0) throw new NotFoundError('tax_profile', profileId);

      if (dto.effectiveTo != null && dto.effectiveTo < dto.effectiveFrom) {
        throw new ValidationError('effectiveTo must be >= effectiveFrom');
      }
      const names = new Set<string>();
      for (const c of dto.components) {
        parseTaxRate(c.rate); // >= 0, < 1, ≤ 6dp — fails loud
        if (names.has(c.name)) throw new ValidationError(`duplicate tax component name "${c.name}"`);
        names.add(c.name);
      }

      const nextRes = await ctx.query<{ next: number }>(
        `SELECT COALESCE(max(version), 0) + 1 AS next FROM tax_profile_version WHERE profile_id = $1`,
        [profileId],
      );
      const version = dto.version ?? nextRes.rows[0]!.next;

      // supersession: an open-ended current version is closed the day before
      // the new one takes effect (same transaction). tax_profile_version
      // carries NO rate data — rates live in the append-only tax_component
      // rows — so this window management can never rewrite rate evidence.
      if (dto.effectiveTo == null) {
        const closed = await ctx.query<{ id: string }>(
          `UPDATE tax_profile_version
              SET effective_to = ($3::date - 1)
            WHERE tenant_id = $1 AND profile_id = $2 AND effective_to IS NULL AND effective_from < $3::date
            RETURNING id`,
          [ctx.tenantId, profileId, dto.effectiveFrom],
        );
        void closed;
      }

      let versionId: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO tax_profile_version (tenant_id, profile_id, version, effective_from, effective_to, note)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [ctx.tenantId, profileId, version, dto.effectiveFrom, dto.effectiveTo ?? null, dto.note ?? null],
        );
        versionId = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') {
          throw new ConflictError(`version ${version} already exists for this profile`);
        }
        if (pgCode(err) === 'P0001' || /overlaps an existing effective window/.test(String(err))) {
          throw new ConflictError(
            'the new version overlaps an existing effective window — versions are the only lawful way rates change',
          );
        }
        throw err;
      }

      for (const c of dto.components) {
        let glAccountId: string | null = null;
        if (c.glAccountCode != null && c.glAccountCode !== '') {
          const acc = await ctx.query<{ id: string }>(
            `SELECT id FROM gl_account WHERE tenant_id = $1 AND code = $2`,
            [ctx.tenantId, c.glAccountCode],
          );
          if (acc.rows.length === 0) {
            throw new NotFoundError('gl_account (by code)', c.glAccountCode);
          }
          glAccountId = acc.rows[0]!.id;
        }
        await ctx.query(
          `INSERT INTO tax_component (tenant_id, version_id, name, rate, inclusive, seq, gl_account_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ctx.tenantId, versionId, c.name, c.rate, c.inclusive, c.seq ?? 0, glAccountId],
        );
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'tax.version.created',
        entityType: 'tax_profile_version',
        entityId: versionId,
        details: {
          profileCode: profile.rows[0]!.code,
          version,
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: dto.effectiveTo ?? null,
          components: dto.components.map((c) => ({ name: c.name, rate: c.rate, inclusive: c.inclusive })),
        },
      });

      const profiles = await this.listTaxProfilesInCtx(ctx);
      return profiles.find((p) => p.id === profileId)!.versions.find((v) => v.id === versionId)!;
    });
  }

  /* ------------------------------ cost policy ------------------------------ */

  /** Effective-dated cost policy at the transaction date (ADR-0004). */
  async resolveCostPolicy(
    ctx: UowContext,
    businessDate: string,
  ): Promise<{ versionId: string; method: 'avco' }> {
    const res = await this.queryEffectiveCostPolicy(ctx, businessDate);
    if (res.rows.length > 0) {
      const row = res.rows[0]!;
      if (row.method !== 'avco') {
        throw new ConflictError(`cost method "${row.method}" is not implemented in Phase 3`);
      }
      return { versionId: row.id, method: 'avco' };
    }
    await this.ensureDefaults(ctx);
    const retry = await this.queryEffectiveCostPolicy(ctx, businessDate);
    if (retry.rows.length === 0) {
      throw new ConflictError('no effective cost policy version for the transaction date');
    }
    return { versionId: retry.rows[0]!.id, method: 'avco' };
  }

  private queryEffectiveCostPolicy(ctx: UowContext, businessDate: string) {
    return ctx.query<{ id: string; method: string }>(
      `SELECT id, method FROM cost_policy_version
       WHERE tenant_id = $1
         AND effective_from <= $2::date
         AND (effective_to IS NULL OR effective_to >= $2::date)
       ORDER BY effective_from DESC, version DESC
       LIMIT 1`,
      [ctx.tenantId, businessDate],
    );
  }

  /* ---------------------------------- GL ----------------------------------- */

  /** Purpose → account id map for the tenant; fails LOUD when a needed
   *  purpose is unmapped (a sale must never silently skip its journal). */
  async resolveGlAccounts(ctx: UowContext, purposes: readonly GlPurpose[]): Promise<Map<GlPurpose, string>> {
    const read = async () =>
      (await ctx.query<{ purpose: string; account_id: string }>(
        `SELECT purpose, account_id FROM gl_mapping WHERE tenant_id = $1`,
        [ctx.tenantId],
      )).rows;
    let map = new Map((await read()).map((r) => [r.purpose as GlPurpose, r.account_id]));
    const missing = () => purposes.filter((p) => !map.has(p));
    if (missing().length > 0) {
      await this.ensureDefaults(ctx);
      map = new Map((await read()).map((r) => [r.purpose as GlPurpose, r.account_id]));
      const still = missing();
      if (still.length > 0) {
        throw new ConflictError(`GL control mapping missing for purpose(s): ${still.join(', ')}`);
      }
    }
    return map;
  }

  /** Per-component payable account override, resolved by component id. */
  async componentAccountOverrides(
    ctx: UowContext,
    componentIds: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const ids = componentIds.filter((id): id is string => id != null);
    if (ids.length === 0) return new Map();
    const res = await ctx.query<{ id: string; gl_account_id: string }>(
      `SELECT id, gl_account_id FROM tax_component WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [ctx.tenantId, ids],
    );
    return new Map(res.rows.filter((r) => r.gl_account_id != null).map((r) => [r.id, r.gl_account_id!]));
  }

  /**
   * Builds and appends a balanced journal inside the open transaction
   * (review finding #2): the domain JournalBuilder refuses unbalanced or
   * malformed entries BEFORE any insert, and the database constraint
   * trigger (migration 0007) re-derives the header totals from the lines at
   * commit — two independent walls around Σ debits == Σ credits.
   *
   * Zero-amount legs are skipped; an entry with no positive legs is not
   * written at all (a no-tax, zero-COGS sale carries no dead journal).
   */
  async postJournal(
    ctx: UowContext,
    args: {
      sourceKind: string;
      sourceId: string;
      event: string;
      description?: string | null;
      occurredAt?: string | null;
      createdBy?: string | null;
      lines: JournalLineSpec[];
    },
  ): Promise<{ id: string; totalDebit: string; totalCredit: string } | null> {
    const builder = new JournalBuilder();
    for (const spec of args.lines) builder.addIfPositive(spec);
    if (builder.lineCount === 0) return null;
    const journal = builder.build();
    const header = await ctx.query<{ id: string }>(
      `INSERT INTO journal_entry
         (tenant_id, source_kind, source_id, event, description, occurred_at, created_by,
          total_debit, total_credit)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, now()),$7,$8,$9)
       RETURNING id`,
      [
        ctx.tenantId, args.sourceKind, args.sourceId, args.event,
        args.description ?? null, args.occurredAt ?? null, args.createdBy ?? ctx.userId,
        journal.totalDebit, journal.totalCredit,
      ],
    );
    const entryId = header.rows[0]!.id;
    for (const line of journal.lines) {
      await ctx.query(
        `INSERT INTO journal_line (tenant_id, entry_id, account_id, debit, credit, memo)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ctx.tenantId, entryId, line.accountId, line.debit, line.credit, line.memo],
      );
    }
    return { id: entryId, totalDebit: journal.totalDebit, totalCredit: journal.totalCredit };
  }

  /** Journal read model with account codes (audit / review queue). */
  async listJournals(
    tenantId: string,
    filter: { sourceKind?: string; sourceId?: string; limit?: number } = {},
  ): Promise<JournalEntryDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'e.tenant_id = $1';
      if (filter.sourceKind) {
        params.push(filter.sourceKind);
        where += ` AND e.source_kind = $${params.length}`;
      }
      if (filter.sourceId) {
        params.push(filter.sourceId);
        where += ` AND e.source_id = $${params.length}`;
      }
      const limit = Math.min(filter.limit ?? 100, 500);
      const entries = await ctx.query<Record<string, unknown>>(
        `SELECT e.id, e.source_kind, e.source_id, e.event, e.description,
                e.occurred_at, e.total_debit::text AS total_debit, e.total_credit::text AS total_credit
         FROM journal_entry e WHERE ${where}
         ORDER BY e.occurred_at DESC, e.created_at DESC LIMIT ${limit}`,
        params,
      );
      const out: JournalEntryDto[] = [];
      for (const e of entries.rows) {
        const lines = await ctx.query<Record<string, unknown>>(
          `SELECT l.id, l.account_id, a.code AS account_code, a.name AS account_name,
                  l.debit::text AS debit, l.credit::text AS credit, l.memo
           FROM journal_line l JOIN gl_account a ON a.id = l.account_id
           WHERE l.entry_id = $1 ORDER BY l.created_at, l.id`,
          [e.id],
        );
        out.push({
          id: String(e.id),
          sourceKind: String(e.source_kind),
          sourceId: String(e.source_id),
          event: String(e.event),
          description: e.description ? String(e.description) : null,
          occurredAt: new Date(e.occurred_at as string).toISOString(),
          totalDebit: String(e.total_debit),
          totalCredit: String(e.total_credit),
          lines: lines.rows.map((l) => ({
            id: String(l.id),
            accountId: String(l.account_id),
            accountCode: String(l.account_code),
            accountName: String(l.account_name),
            debit: String(l.debit),
            credit: String(l.credit),
            memo: l.memo ? String(l.memo) : null,
          })),
        });
      }
      return out;
    });
  }

  /** Chart of accounts (read). */
  async listAccounts(
    tenantId: string,
  ): Promise<Array<{ id: string; code: string; name: string; accountType: string; isActive: boolean }>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT id, code, name, account_type, is_active FROM gl_account
         WHERE tenant_id = $1 ORDER BY code`,
        [ctx.tenantId],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        code: String(r.code),
        name: String(r.name),
        accountType: String(r.account_type),
        isActive: Boolean(r.is_active),
      }));
    });
  }

  /** Purpose → account mappings (read). */
  async listMappings(
    tenantId: string,
  ): Promise<Array<{ purpose: string; accountCode: string; accountName: string; accountId: string }>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT m.purpose, m.account_id, a.code AS account_code, a.name AS account_name
         FROM gl_mapping m JOIN gl_account a ON a.id = m.account_id
         WHERE m.tenant_id = $1 ORDER BY m.purpose`,
        [ctx.tenantId],
      );
      return res.rows.map((r) => ({
        purpose: String(r.purpose),
        accountCode: String(r.account_code),
        accountName: String(r.account_name),
        accountId: String(r.account_id),
      }));
    });
  }

  /* --------------------------- override approval --------------------------- */

  /**
   * Verifies a supervisor approval for a material price/discount override
   * (review finding #4): the approver must be an ACTIVE user of THIS tenant
   * whose password verifies server-side and who holds the same override
   * permission themselves. Client-side "approved by X" claims are worth
   * nothing — the credentials are checked against the stored hash here,
   * inside the posting transaction.
   */
  async verifyOverrideApprover(
    ctx: UowContext,
    args: { username: string; password: string; requiredPermission: Permission },
  ): Promise<void> {
    const res = await ctx.query<{ id: string; password_hash: string; roles: string[] }>(
      `SELECT id, password_hash, roles FROM app_user
       WHERE tenant_id = $1 AND email = lower($2) AND status = 'active'`,
      [ctx.tenantId, args.username],
    );
    const user = res.rows[0];
    if (!user) throw new ValidationError('override approver not found or inactive');
    const ok = await verifyPassword(user.password_hash, args.password);
    if (!ok) throw new ValidationError('override approver credentials rejected');
    if (!hasPermission(user.roles, args.requiredPermission)) {
      throw new ValidationError(
        `override approver lacks the required permission (${args.requiredPermission})`,
      );
    }
  }

  /** Tenant-configured override materiality thresholds (0 = permission +
   *  reason suffices; > 0 additionally requires supervisor approval). */
  async overrideThresholds(ctx: UowContext): Promise<{ price: bigint; discount: bigint }> {
    const res = await ctx.query<{ price_override_threshold: string; discount_override_threshold: string }>(
      `SELECT price_override_threshold::text AS price_override_threshold,
              discount_override_threshold::text AS discount_override_threshold
       FROM tenant_config WHERE tenant_id = $1`,
      [ctx.tenantId],
    );
    const row = res.rows[0];
    return {
      price: row ? parseMoney(row.price_override_threshold) : 0n,
      discount: row ? parseMoney(row.discount_override_threshold) : 0n,
    };
  }

  /* --------------------------------- utils --------------------------------- */

  private async accountCodeMap(ctx: UowContext): Promise<Map<string, string>> {
    const res = await ctx.query<{ id: string; code: string }>(
      `SELECT id, code FROM gl_account WHERE tenant_id = $1`,
      [ctx.tenantId],
    );
    return new Map(res.rows.map((r) => [r.id, r.code]));
  }
}
