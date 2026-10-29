import { Injectable } from '@nestjs/common';
import type {
  CreateCustomer,
  CreateSupplier,
  CustomerDto,
  ListDto,
  PartyOpeningBalanceDto,
  PostPartyOpeningBalance,
  SupplierDto,
} from '@idepot/contracts';
import { NotFoundError } from '@idepot/domain';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { PartyRepository } from './party.repository.js';
import type { UpdateCustomerPatch, UpdateSupplierPatch } from './party.repository.js';

interface Principal {
  userId: string;
  tenantId: string;
  displayName: string;
}

/**
 * Customers, suppliers and party opening balances.
 * Every mutating operation = one posting transaction (document + audit +
 * outbox). Opening balances are document FOUNDATION only: the AR/AP/GL
 * posting arrives with Phase 4 (outbox consumers must not post them).
 */
@Injectable()
export class PartyService {
  constructor(private readonly uow: UnitOfWork, private readonly repo: PartyRepository) {}

  /* ------------------------------- customers ------------------------------ */

  createCustomer(principal: Principal, dto: CreateCustomer): Promise<CustomerDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const customer = await this.repo.createCustomer(dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'customer.created',
        entityType: 'customer',
        entityId: customer.id,
        details: { code: customer.code, name: customer.name, phone: customer.phone },
      });
      await ctx.outbox.emit('CustomerCreated', { customerId: customer.id, code: customer.code });
      return customer;
    });
  }

  updateCustomer(principal: Principal, id: string, dto: UpdateCustomerPatch): Promise<CustomerDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const customer = await this.repo.updateCustomer(id, dto);
      if (!customer) throw new NotFoundError('customer', id);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'customer.updated',
        entityType: 'customer',
        entityId: customer.id,
        details: { ...dto },
      });
      await ctx.outbox.emit('CustomerUpdated', { customerId: customer.id });
      return customer;
    });
  }

  getCustomer(principal: { tenantId: string }, id: string): Promise<CustomerDto> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => {
      const customer = await this.repo.findCustomerById(id);
      if (!customer) throw new NotFoundError('customer', id);
      return customer;
    });
  }

  listCustomers(principal: { tenantId: string }): Promise<ListDto<CustomerDto>> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => this.repo.listCustomers());
  }

  /* ------------------------------- suppliers ------------------------------ */

  createSupplier(principal: Principal, dto: CreateSupplier): Promise<SupplierDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const supplier = await this.repo.createSupplier(dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'supplier.created',
        entityType: 'supplier',
        entityId: supplier.id,
        details: { code: supplier.code, name: supplier.name, phone: supplier.phone },
      });
      await ctx.outbox.emit('SupplierCreated', { supplierId: supplier.id, code: supplier.code });
      return supplier;
    });
  }

  updateSupplier(principal: Principal, id: string, dto: UpdateSupplierPatch): Promise<SupplierDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const supplier = await this.repo.updateSupplier(id, dto);
      if (!supplier) throw new NotFoundError('supplier', id);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'supplier.updated',
        entityType: 'supplier',
        entityId: supplier.id,
        details: { ...dto },
      });
      await ctx.outbox.emit('SupplierUpdated', { supplierId: supplier.id });
      return supplier;
    });
  }

  getSupplier(principal: { tenantId: string }, id: string): Promise<SupplierDto> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => {
      const supplier = await this.repo.findSupplierById(id);
      if (!supplier) throw new NotFoundError('supplier', id);
      return supplier;
    });
  }

  listSuppliers(principal: { tenantId: string }): Promise<ListDto<SupplierDto>> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => this.repo.listSuppliers());
  }

  /* --------------------------- opening balances --------------------------- */

  postOpeningBalance(principal: Principal, dto: PostPartyOpeningBalance): Promise<PartyOpeningBalanceDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const balance = await this.repo.createOpeningBalance({
        partyType: dto.partyType,
        partyId: dto.partyId,
        amount: dto.amount,
        note: dto.note ?? null,
        createdBy: principal.userId,
      });
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'party_opening_balance.posted',
        entityType: 'party_opening_balance',
        entityId: balance.id,
        details: { partyType: balance.partyType, partyId: balance.partyId, amount: balance.amount },
      });
      await ctx.outbox.emit('PartyOpeningBalancePosted', {
        openingBalanceId: balance.id,
        partyType: balance.partyType,
        partyId: balance.partyId,
        amount: balance.amount,
      });
      return balance;
    });
  }

  listOpeningBalances(principal: { tenantId: string }): Promise<ListDto<PartyOpeningBalanceDto>> {
    return this.uow.run(
      { tenantId: principal.tenantId },
      async () => this.repo.listOpeningBalances(),
    );
  }
}
