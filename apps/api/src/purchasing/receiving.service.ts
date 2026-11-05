/**
 * Goods receipt notes (Phase 4) — the STOCK authority of the corrected
 * purchasing model.
 *
 * Posting set (ONE UnitOfWork transaction, ADR-0001):
 *   goods_receipt + lines
 *   + append-only stock receipt movements (AVCO cost layers, unit_cost
 *     per BASE unit) via StockPoster
 *   + purchase_order_line.received_quantity_base counters (row-locked,
 *     deterministic order — concurrent receipts against the same PO
 *     serialize; over-receipt beyond tolerance is a conflict)
 *   + GL journal: Dr Inventory / Cr GR-IR accrual (the supplier
 *     invoice later clears the accrual — inventory value is NEVER
 *     double-posted at invoice time)
 *   + audit + outbox
 */
import { Injectable } from '@nestjs/common';
import type { CreateGrn, GrnDto, GrnLineDto } from '@idepot/contracts';
import {
  ConflictError,
  ValidationError,
  formatDecimal,
  formatMoney,
  grnLineValue,
  parseMoney,
  parseQuantity,
  parseTolerancePct,
  evaluateReceivingQuantity,
  type GlPurpose,
  type JournalLineSpec,
  type MovementEntry,
} from '@idepot/domain';
import { QTY_SCALE } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from '../sales/document-sequence.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockPoster } from '../inventory/stock-poster.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
import {
  dateCol,
  lockRow,
  pgCode,
  requireRow,
  resolveBaseQuantity,
  purchasingTolerance,
  type PurchasingPrincipal,
} from './purchasing-common.js';

@Injectable()
export class ReceivingService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sequences: DocumentSequenceService,
    private readonly stockPoster: StockPoster,
    private readonly finance: FinancialConfigurationService,
  ) {}

  async postGrn(principal: PurchasingPrincipal, dto: CreateGrn): Promise<GrnDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'supplier', 'supplier', [dto.supplierId]);
      await assertTenantRefs(ctx, 'warehouse', 'warehouse', [dto.warehouseId]);
      await assertTenantRefs(ctx, 'product', 'product', [...new Set(dto.lines.map((l) => l.productId))]);

      // ---- 1. resolve the PO (when present) and lock its header -------
      let po: Record<string, unknown> | null = null;
      if (dto.purchaseOrderId != null && dto.purchaseOrderId !== '') {
        po = await lockRow(ctx, 'purchase_order', dto.purchaseOrderId);
        const status = String(po.status);
        if (!['approved', 'issued', 'partially_received', 'received'].includes(status)) {
          throw new ConflictError(
            `purchase order ${dto.purchaseOrderId} is "${status}" — receiving requires approved/issued/partially_received/received`,
          );
        }
        if (String(po.supplier_id) !== dto.supplierId) {
          throw new ValidationError('goods receipt supplier does not match the purchase order supplier');
        }
        if (String(po.warehouse_id) !== dto.warehouseId) {
          throw new ValidationError('goods receipt warehouse does not match the purchase order warehouse');
        }
      }

      // ---- 2. lock the referenced PO lines in DETERMINISTIC order -----
      // (concurrent receipts against the same PO serialize here; no
      // deadlock is possible because every writer uses sorted order)
      const poLineIds = dto.lines
        .map((l) => l.purchaseOrderLineId ?? null)
        .filter((v): v is string => v != null)
        .sort();
      const poLines = new Map<string, Record<string, unknown>>();
      for (const polId of poLineIds) {
        if (po == null) {
          throw new ValidationError('lines reference purchase order lines but no purchase order was given');
        }
        const row = await lockRow(ctx, 'purchase_order_line', polId);
        if (String(row.purchase_order_id) !== String(po.id)) {
          throw new ValidationError(`PO line ${polId} does not belong to purchase order ${String(po.id)}`);
        }
        poLines.set(polId, row);
      }

      // ---- 3. resolve lines: conversions, cost, tolerance --------------
      const tolerance = await purchasingTolerance(ctx);
      const overreceiptPct = parseTolerancePct(tolerance.overreceiptTolerancePct);
      const resolved: Array<{
        line: CreateGrn['lines'][number];
        quantityBase: string;
        conversionFactor: string;
        unitId: string | null;
        lineValue: string;
        match: ReturnType<typeof evaluateReceivingQuantity>;
      }> = [];
      const seenProducts = new Set<string>();
      for (const line of dto.lines) {
        if (seenProducts.has(line.productId)) {
          throw new ValidationError('duplicate product line — merge quantities onto one line');
        }
        seenProducts.add(line.productId);
        const conv = await resolveBaseQuantity(ctx, {
          productId: line.productId,
          unitId: line.unitId ?? null,
          quantity: line.receivedQuantity,
        });
        const value = grnLineValue(conv.quantityBase, line.unitCost);

        let match: ReturnType<typeof evaluateReceivingQuantity>;
        const pol = line.purchaseOrderLineId != null ? poLines.get(line.purchaseOrderLineId) : undefined;
        if (pol != null) {
          match = evaluateReceivingQuantity({
            orderedBase: parseQuantity(String(pol.ordered_quantity_base)),
            previouslyReceivedBase: parseQuantity(String(pol.received_quantity_base)),
            receivingBase: parseQuantity(conv.quantityBase),
            tolerance: {
              overreceiptTolerancePct: overreceiptPct,
              priceTolerancePct: 0n,
              valueTolerance: 0n,
            },
          });
        } else {
          // direct receipt (no PO line): no ordered quantity to compare
          match = { severity: 'info', varianceBase: 0n, limitBase: 0n };
        }
        resolved.push({ line, ...conv, lineValue: value, match });
      }

      // over-receipt beyond the configured tolerance requires a verified
      // supervisor approval (credentials checked server-side, Phase 3
      // hardening pattern) — never a silent acceptance
      const needsApproval = resolved.some((r) => r.match.severity === 'approval_required');
      if (needsApproval && dto.overreceiptApproval == null) {
        const worst = resolved.find((r) => r.match.severity === 'approval_required')!;
        throw new ConflictError(
          `over-receipt beyond tolerance: received ${worst.match.varianceBase > 0n ? '+' : ''}` +
            `${parseQuantity(String(worst.match.varianceBase))} base units over the ordered quantity ` +
            `(limit +${worst.match.limitBase}); a supervisor over-receipt approval is required`,
        );
      }
      if (needsApproval && dto.overreceiptApproval != null) {
        await this.finance.verifyOverrideApprover(ctx, {
          username: dto.overreceiptApproval.username,
          password: dto.overreceiptApproval.password,
          requiredPermission: 'purchasing:approve',
        });
      }

      // ---- 4. period lock + document numbering ------------------------
      await this.finance.assertPeriodOpen(ctx, dto.businessDate);
      const code = await this.sequences.allocate(ctx, { docType: 'GRN' });

      // ---- 5. insert the GRN header + lines ---------------------------
      let grnId: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO goods_receipt
             (tenant_id, code, purchase_order_id, supplier_id, warehouse_id, business_date,
              supplier_delivery_ref, notes, received_by, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'posted') RETURNING id`,
          [
            ctx.tenantId, code, dto.purchaseOrderId ?? null, dto.supplierId, dto.warehouseId,
            dto.businessDate, dto.supplierDeliveryRef ?? null, dto.notes ?? null, principal.userId,
          ],
        );
        grnId = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') throw new ConflictError(`goods receipt code "${code}" already exists`);
        throw err;
      }

      const insertedLineIds: string[] = [];
      for (const r of resolved) {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO goods_receipt_line
             (tenant_id, goods_receipt_id, purchase_order_line_id, product_id, unit_id,
              received_quantity, conversion_factor, received_quantity_base, rejected_quantity_base,
              unit_cost, line_value)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            ctx.tenantId, grnId, r.line.purchaseOrderLineId ?? null, r.line.productId, r.unitId,
            r.line.receivedQuantity, r.conversionFactor, r.quantityBase,
            r.line.rejectedQuantityBase ?? '0', r.line.unitCost, r.lineValue,
          ],
        );
        insertedLineIds.push(res.rows[0]!.id);
      }

      // ---- 6. stock movements (append-only ledger + AVCO layers) ------
      const movements: MovementEntry[] = resolved.map((r) => ({
        warehouseId: dto.warehouseId,
        productId: r.line.productId,
        movementType: 'receipt' as const,
        quantityBase: r.quantityBase,
        unitId: r.unitId,
        quantityTransacted: r.unitId != null ? r.line.receivedQuantity : null,
        conversionFactor: r.unitId != null ? r.conversionFactor : null,
        reason: 'goods_receipt',
        sourceDocumentType: 'goods_receipt',
        sourceDocumentId: grnId,
        unitCost: r.line.unitCost,
      }));
      await this.stockPoster.post(ctx, movements, {
        sourceDocumentType: 'goods_receipt',
        sourceDocumentId: grnId,
        createdBy: principal.userId,
      });

      // ---- 7. PO line counters + status transition --------------------
      let anyOpen = false;
      let anyReceived = false;
      for (const r of resolved) {
        const polId = r.line.purchaseOrderLineId;
        if (polId == null) continue;
        const pol = poLines.get(polId)!;
        const ordered = parseQuantity(String(pol.ordered_quantity_base));
        const prev = parseQuantity(String(pol.received_quantity_base));
        const now = prev + parseQuantity(r.quantityBase);
        await ctx.query(
          `UPDATE purchase_order_line SET received_quantity_base = $3 WHERE id = $1 AND tenant_id = $2`,
          [polId, ctx.tenantId, formatDecimal(now, QTY_SCALE)],
        );
        if (now >= ordered) anyReceived = true;
        else anyOpen = true;
      }
      if (po != null) {
        const nextStatus =
          anyOpen && anyReceived ? 'partially_received' : anyOpen ? 'issued' : 'received';
        await ctx.query(
          `UPDATE purchase_order SET status = $3, updated_at = now()
           WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('cancelled','closed')`,
          [String(po.id), ctx.tenantId, nextStatus],
        );
      }

      // ---- 8. GL journal: Dr Inventory / Cr GR-IR ----------------------
      const totalValue = resolved.reduce((s, r) => s + parseMoney(r.lineValue), 0n);
      if (totalValue > 0n) {
        const purposes: GlPurpose[] = ['inventory', 'grni_clearing'];
        const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
        const lines: JournalLineSpec[] = [
          {
            accountId: accounts.get('inventory')!,
            debit: formatMoney(totalValue),
            memo: `GRN ${code} inventory received`,
          },
          {
            accountId: accounts.get('grni_clearing')!,
            credit: formatMoney(totalValue),
            memo: `GRN ${code} accrual (pending supplier invoice)`,
          },
        ];
        await this.finance.postJournal(ctx, {
          sourceKind: 'goods_receipt',
          sourceId: grnId,
          event: 'grn_posted',
          description: `Goods receipt ${code}`,
          businessDate: dto.businessDate,
          reference: code,
          createdBy: principal.userId,
          lines,
        });
      }

      // ---- 8b. TEST ONLY: deterministic failure injection ----------------
      if (dto.simulateFailure === 'after_journal' || dto.simulateFailure === 'after_writes') {
        throw new Error(`simulated failure after ${dto.simulateFailure === 'after_journal' ? 'journal' : 'writes'} (atomicity test)`);
      }

      // ---- 9. audit + outbox -------------------------------------------
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'goods_receipt.posted',
        entityType: 'goods_receipt',
        entityId: grnId,
        details: {
          code,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          purchaseOrderId: dto.purchaseOrderId ?? null,
          businessDate: dto.businessDate,
          totalValue: formatMoney(totalValue),
          lineCount: resolved.length,
          overreceiptApproved: needsApproval,
        },
      });
      await ctx.outbox.emit('PurchaseReceived', {
        goodsReceiptId: grnId,
        code,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        totalValue: formatMoney(totalValue),
      });
      return this.getGrnWithinCtx(ctx, grnId);
    });
  }

  async getGrn(tenantId: string, grnId: string): Promise<GrnDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.getGrnWithinCtx(ctx, grnId));
  }

  async listGrns(
    tenantId: string,
    filter: { supplierId?: string; purchaseOrderId?: string; limit?: number } = {},
  ): Promise<GrnDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'g.tenant_id = $1';
      if (filter.supplierId) {
        params.push(filter.supplierId);
        where += ` AND g.supplier_id = $${params.length}`;
      }
      if (filter.purchaseOrderId) {
        params.push(filter.purchaseOrderId);
        where += ` AND g.purchase_order_id = $${params.length}`;
      }
      const limit = Math.min(filter.limit ?? 100, 500);
      const res = await ctx.query<{ id: string }>(
        `SELECT g.id FROM goods_receipt g WHERE ${where}
         ORDER BY g.created_at DESC LIMIT ${limit}`,
        params,
      );
      const out: GrnDto[] = [];
      for (const r of res.rows) out.push(await this.getGrnWithinCtx(ctx, String(r.id)));
      return out;
    });
  }

  async getGrnWithinCtx(ctx: UowContext, grnId: string): Promise<GrnDto> {
    const grn = await requireRow<Record<string, unknown>>(ctx, 'goods_receipt', grnId);
    const supplier = await ctx.query<{ name: string }>(
      `SELECT name FROM supplier WHERE id = $1`, [String(grn.supplier_id)],
    );
    let poCode: string | null = null;
    if (grn.purchase_order_id != null) {
      const po = await ctx.query<{ code: string }>(
        `SELECT code FROM purchase_order WHERE id = $1`, [String(grn.purchase_order_id)],
      );
      poCode = po.rows[0]?.code ?? null;
    }
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT * FROM goods_receipt_line WHERE goods_receipt_id = $1 ORDER BY created_at, id`,
      [grnId],
    );
    const lineDtos: GrnLineDto[] = lines.rows.map((l) => ({
      id: String(l.id),
      purchaseOrderLineId: l.purchase_order_line_id ? String(l.purchase_order_line_id) : null,
      productId: String(l.product_id),
      receivedQuantity: String(l.received_quantity),
      conversionFactor: String(l.conversion_factor),
      receivedQuantityBase: String(l.received_quantity_base),
      rejectedQuantityBase: String(l.rejected_quantity_base),
      unitCost: String(l.unit_cost),
      lineValue: String(l.line_value),
    }));
    return {
      id: String(grn.id),
      code: String(grn.code),
      purchaseOrderId: grn.purchase_order_id ? String(grn.purchase_order_id) : null,
      purchaseOrderCode: poCode,
      supplierId: String(grn.supplier_id),
      supplierName: supplier.rows[0]?.name ?? null,
      warehouseId: String(grn.warehouse_id),
      businessDate: dateCol(grn.business_date),
      supplierDeliveryRef: grn.supplier_delivery_ref ? String(grn.supplier_delivery_ref) : null,
      notes: grn.notes ? String(grn.notes) : null,
      status: String(grn.status),
      receivedBy: grn.received_by ? String(grn.received_by) : null,
      createdAt: new Date(grn.created_at as string).toISOString(),
      lines: lineDtos,
      totalValue: formatMoney(lineDtos.reduce((s, l) => s + parseMoney(l.lineValue), 0n)),
    };
  }
}
