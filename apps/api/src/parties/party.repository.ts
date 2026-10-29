import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateCustomer,
  CreateSupplier,
  CustomerDto,
  ListDto,
  PartyOpeningBalanceDto,
  SupplierDto,
} from '@idepot/contracts';
import { ConflictError, NotFoundError, validateNewCustomer, validateNewSupplier } from '@idepot/domain';
import { UnitOfWork } from '../db/unit-of-work.js';

/** contracts ships Update{Customer,Supplier}Schema without inferred aliases;
 *  these mirror z.infer — partial create shapes, code immutable after creation. */
export type UpdateCustomerPatch = Partial<Omit<CreateCustomer, 'code'>>;
export type UpdateSupplierPatch = Partial<Omit<CreateSupplier, 'code'>>;

/** Postgres SQLSTATE of a driver error, when present (23505 unique, 23503 fk). */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/** Party codes are optional on the wire; when absent a readable one is minted. */
function generatePartyCode(prefix: 'CUS' | 'SUP'): string {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

/**
 * Parties write model: customers, suppliers and party opening balances.
 * Phone-first identity — phone is required, email optional (domain layer).
 * Repository-layer enforcement (ADR-0001): every method resolves the active
 * UnitOfWork context; a call outside a UoW throws NoActiveTransactionError.
 */
@Injectable()
export class PartyRepository {
  /* ------------------------------- customers ------------------------------ */

  async createCustomer(input: CreateCustomer): Promise<CustomerDto> {
    const ctx = UnitOfWork.require();
    const code = input.code ?? generatePartyCode('CUS');
    validateNewCustomer({ ...input, code });
    try {
      const res = await ctx.query(
        `INSERT INTO customer (tenant_id, code, name, contact_person, phone, alt_phone,
                               email, address, is_guest, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, code, name, contact_person, phone, alt_phone, email, address,
                   is_guest, status, created_at`,
        [
          ctx.tenantId,
          code,
          input.name,
          input.contactPerson ?? null,
          input.phone,
          input.altPhone ?? null,
          input.email ?? null,
          input.address ?? null,
          input.isGuest ?? false,
          input.status ?? 'active',
        ],
      );
      return this.customerToDto(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      if (pgCode(err) === '23505') throw new ConflictError('customer code already exists');
      throw err;
    }
  }

  async listCustomers(): Promise<ListDto<CustomerDto>> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, contact_person, phone, alt_phone, email, address,
              is_guest, status, created_at,
              count(*) OVER ()::int AS total
       FROM customer
       ORDER BY created_at DESC, id
       LIMIT 200`,
    );
    return {
      items: res.rows.map((r) => this.customerToDto(r as Record<string, unknown>)),
      total: res.rows[0] ? Number((res.rows[0] as Record<string, unknown>).total) : 0,
    };
  }

  async findCustomerById(id: string): Promise<CustomerDto | undefined> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, contact_person, phone, alt_phone, email, address,
              is_guest, status, created_at
       FROM customer WHERE id = $1`,
      [id],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.customerToDto(row) : undefined;
  }

  async updateCustomer(id: string, patch: UpdateCustomerPatch): Promise<CustomerDto | undefined> {
    const ctx = UnitOfWork.require();
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.phone !== undefined) {
      params.push(patch.phone);
      sets.push(`phone = $${params.length}`);
    }
    if (patch.contactPerson !== undefined) {
      params.push(patch.contactPerson ?? null);
      sets.push(`contact_person = $${params.length}`);
    }
    if (patch.altPhone !== undefined) {
      params.push(patch.altPhone ?? null);
      sets.push(`alt_phone = $${params.length}`);
    }
    if (patch.email !== undefined) {
      params.push(patch.email ?? null);
      sets.push(`email = $${params.length}`);
    }
    if (patch.address !== undefined) {
      params.push(patch.address ?? null);
      sets.push(`address = $${params.length}`);
    }
    if (patch.isGuest !== undefined) {
      params.push(patch.isGuest);
      sets.push(`is_guest = $${params.length}`);
    }
    if (patch.status !== undefined) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    params.push(id);
    const res = await ctx.query(
      `UPDATE customer SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, code, name, contact_person, phone, alt_phone, email, address,
                 is_guest, status, created_at`,
      params,
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.customerToDto(row) : undefined;
  }

  /* ------------------------------- suppliers ------------------------------ */

  async createSupplier(input: CreateSupplier): Promise<SupplierDto> {
    const ctx = UnitOfWork.require();
    const code = input.code ?? generatePartyCode('SUP');
    validateNewSupplier({ ...input, code });
    try {
      const res = await ctx.query(
        `INSERT INTO supplier (tenant_id, code, name, contact_person, phone, alt_phone,
                               email, address, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, code, name, contact_person, phone, alt_phone, email, address,
                   status, created_at`,
        [
          ctx.tenantId,
          code,
          input.name,
          input.contactPerson ?? null,
          input.phone,
          input.altPhone ?? null,
          input.email ?? null,
          input.address ?? null,
          input.status ?? 'active',
        ],
      );
      return this.supplierToDto(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      if (pgCode(err) === '23505') throw new ConflictError('supplier code already exists');
      throw err;
    }
  }

  async listSuppliers(): Promise<ListDto<SupplierDto>> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, contact_person, phone, alt_phone, email, address,
              status, created_at,
              count(*) OVER ()::int AS total
       FROM supplier
       ORDER BY created_at DESC, id
       LIMIT 200`,
    );
    return {
      items: res.rows.map((r) => this.supplierToDto(r as Record<string, unknown>)),
      total: res.rows[0] ? Number((res.rows[0] as Record<string, unknown>).total) : 0,
    };
  }

  async findSupplierById(id: string): Promise<SupplierDto | undefined> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, contact_person, phone, alt_phone, email, address,
              status, created_at
       FROM supplier WHERE id = $1`,
      [id],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.supplierToDto(row) : undefined;
  }

  async updateSupplier(id: string, patch: UpdateSupplierPatch): Promise<SupplierDto | undefined> {
    const ctx = UnitOfWork.require();
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.phone !== undefined) {
      params.push(patch.phone);
      sets.push(`phone = $${params.length}`);
    }
    if (patch.contactPerson !== undefined) {
      params.push(patch.contactPerson ?? null);
      sets.push(`contact_person = $${params.length}`);
    }
    if (patch.altPhone !== undefined) {
      params.push(patch.altPhone ?? null);
      sets.push(`alt_phone = $${params.length}`);
    }
    if (patch.email !== undefined) {
      params.push(patch.email ?? null);
      sets.push(`email = $${params.length}`);
    }
    if (patch.address !== undefined) {
      params.push(patch.address ?? null);
      sets.push(`address = $${params.length}`);
    }
    if (patch.status !== undefined) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    params.push(id);
    const res = await ctx.query(
      `UPDATE supplier SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, code, name, contact_person, phone, alt_phone, email, address,
                 status, created_at`,
      params,
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.supplierToDto(row) : undefined;
  }

  /* --------------------------- opening balances --------------------------- */

  /**
   * FOUNDATION posting (ROADMAP Phase 2): inserts the opening-balance
   * document + audit + outbox. AR/AP/GL posting arrives with Phase 4.
   * The party existence check is an RLS-filtered SELECT — cross-tenant and
   * missing parties are both "not found".
   */
  async createOpeningBalance(input: {
    partyType: 'customer' | 'supplier';
    partyId: string;
    amount: string;
    note?: string | null;
    createdBy: string;
  }): Promise<PartyOpeningBalanceDto> {
    const ctx = UnitOfWork.require();
    const table = input.partyType === 'customer' ? 'customer' : 'supplier';
    const exists = await ctx.query(`SELECT 1 FROM ${table} WHERE id = $1`, [input.partyId]);
    if (exists.rows.length === 0) throw new NotFoundError(input.partyType, input.partyId);
    const res = await ctx.query(
      `INSERT INTO party_opening_balance (tenant_id, party_type, party_id, amount, note, source, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'manual','posted',$6)
       RETURNING id, party_type, party_id, amount, note, status, created_at`,
      [ctx.tenantId, input.partyType, input.partyId, input.amount, input.note ?? null, input.createdBy],
    );
    return this.openingBalanceToDto(res.rows[0] as Record<string, unknown>);
  }

  async listOpeningBalances(): Promise<ListDto<PartyOpeningBalanceDto>> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, party_type, party_id, amount, note, status, created_at,
              count(*) OVER ()::int AS total
       FROM party_opening_balance
       ORDER BY created_at DESC, id
       LIMIT 200`,
    );
    return {
      items: res.rows.map((r) => this.openingBalanceToDto(r as Record<string, unknown>)),
      total: res.rows[0] ? Number((res.rows[0] as Record<string, unknown>).total) : 0,
    };
  }

  /* ------------------------------- internals ------------------------------ */

  private customerToDto(r: Record<string, unknown>): CustomerDto {
    return {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      contactPerson: r.contact_person == null ? null : String(r.contact_person),
      phone: String(r.phone),
      altPhone: r.alt_phone == null ? null : String(r.alt_phone),
      email: r.email == null ? null : String(r.email),
      address: r.address == null ? null : String(r.address),
      isGuest: Boolean(r.is_guest),
      status: String(r.status) as CustomerDto['status'],
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }

  private supplierToDto(r: Record<string, unknown>): SupplierDto {
    return {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      contactPerson: r.contact_person == null ? null : String(r.contact_person),
      phone: String(r.phone),
      altPhone: r.alt_phone == null ? null : String(r.alt_phone),
      email: r.email == null ? null : String(r.email),
      address: r.address == null ? null : String(r.address),
      status: String(r.status) as SupplierDto['status'],
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }

  private openingBalanceToDto(r: Record<string, unknown>): PartyOpeningBalanceDto {
    return {
      id: String(r.id),
      partyType: String(r.party_type) as PartyOpeningBalanceDto['partyType'],
      partyId: String(r.party_id),
      amount: String(r.amount),
      note: r.note == null ? null : String(r.note),
      status: String(r.status) as PartyOpeningBalanceDto['status'],
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }
}
