import { z } from 'zod';

/* ---------------------------------- auth ---------------------------------- */

export const LoginRequestSchema = z.object({
  tenantSlug: z.string().min(2).max(63),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  deviceCode: z.string().min(3).max(100).optional(),
  platform: z.string().min(1).max(50).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    tenantId: string;
    tenantSlug: string;
  };
}

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const DeviceRegisterRequestSchema = z.object({
  deviceCode: z.string().min(3).max(100),
  platform: z.string().min(1).max(50),
  name: z.string().max(120).optional(),
});
export type DeviceRegisterRequest = z.infer<typeof DeviceRegisterRequestSchema>;

/* -------------------------------- warehouse -------------------------------- */

export const CreateWarehouseSchema = z.object({
  code: z.string().min(2).max(32),
  name: z.string().min(2).max(200),
  isActive: z.boolean().optional(),
});
export type CreateWarehouse = z.infer<typeof CreateWarehouseSchema>;

export const UpdateWarehouseSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWarehouse = z.infer<typeof UpdateWarehouseSchema>;

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface ListDto<T> {
  items: T[];
  total: number;
}

/* ----------------------------- sample document ----------------------------- */

export const PostSampleDocumentSchema = z.object({
  code: z.string().min(2).max(32),
  totalAmount: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'decimal(18,4) as string'),
  /** injects a failure AFTER partial writes — proves all-or-nothing rollback */
  simulateFailureAfterWrites: z.boolean().optional(),
});
export type PostSampleDocument = z.infer<typeof PostSampleDocumentSchema>;

/* ================================ Phase 2 ================================= */

const qty = () => z.string().regex(/^-?\d{1,14}(\.\d{1,6})?$/, 'decimal(18,6) as string');
const money = () => z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'decimal(18,4) as string');
const uuid = () => z.string().uuid();
const isoDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/* --------------------------------- catalog -------------------------------- */

export const CreateUnitSchema = z.object({ code: z.string().min(2).max(40), name: z.string().min(1).max(100) });
export type CreateUnit = z.infer<typeof CreateUnitSchema>;
export interface UnitDto { id: string; code: string; name: string; isActive: boolean; }

export const CreateCategorySchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(200),
  parentId: uuid().nullish(),
});
export type CreateCategory = z.infer<typeof CreateCategorySchema>;
export const UpdateCategorySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  isActive: z.boolean().optional(),
});
export interface CategoryDto {
  id: string; parentId: string | null; code: string; name: string; isActive: boolean;
}

export const CreateBrandSchema = z.object({ code: z.string().min(2).max(40), name: z.string().min(2).max(200) });
export interface BrandDto { id: string; code: string; name: string; }

const ProductStatusSchema = z.enum(['active', 'inactive', 'archived']);

export const CreateProductSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(300),
  description: z.string().max(4000).nullish(),
  categoryId: uuid().nullish(),
  supplierId: uuid().nullish(),
  brandId: uuid().nullish(),
  baseUnitId: uuid(),
  defaultSaleUnitId: uuid().nullish(),
  soldInUnits: z.boolean().optional(),
  sellingPrice: money(),
  purchasePrice: money().nullish(),
  status: ProductStatusSchema.optional(),
});
export type CreateProduct = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = z.object({
  name: z.string().min(2).max(300).optional(),
  description: z.string().max(4000).nullish(),
  categoryId: uuid().nullish(),
  supplierId: uuid().nullish(),
  brandId: uuid().nullish(),
  defaultSaleUnitId: uuid().nullish(),
  soldInUnits: z.boolean().optional(),
  sellingPrice: money().optional(),
  purchasePrice: money().nullish(),
  status: ProductStatusSchema.optional(),
});
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;

export interface ProductDto {
  id: string; code: string; name: string; description: string | null;
  categoryId: string | null; supplierId: string | null; brandId: string | null;
  baseUnitId: string; defaultSaleUnitId: string | null;
  soldInUnits: boolean; sellingPrice: string; purchasePrice: string | null;
  status: 'active' | 'inactive' | 'archived'; createdAt: string;
}

export const CreateProductUnitSchema = z.object({
  unitId: uuid(),
  conversionFactor: qty(),
  price: money().nullish(),
  isDefaultSale: z.boolean().optional(),
});
export type CreateProductUnit = z.infer<typeof CreateProductUnitSchema>;
export interface ProductUnitDto {
  id: string; productId: string; unitId: string; unitCode: string | null;
  conversionFactor: string; price: string | null; isDefaultSale: boolean;
}

export const CreateBarcodeSchema = z.object({
  barcode: z.string().min(3).max(64),
  isPrimary: z.boolean().optional(),
});
export type CreateBarcode = z.infer<typeof CreateBarcodeSchema>;
export interface ProductBarcodeDto {
  id: string; productId: string; barcode: string; isPrimary: boolean;
}

/* --------------------------------- parties -------------------------------- */

const PartyStatusSchema = z.enum(['active', 'inactive']);

export const CreateCustomerSchema = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(2).max(300),
  phone: z.string().min(7).max(25),
  contactPerson: z.string().max(200).nullish(),
  altPhone: z.string().max(25).nullish(),
  email: z.string().email().max(200).nullish(),
  address: z.string().max(500).nullish(),
  isGuest: z.boolean().optional(),
  status: PartyStatusSchema.optional(),
});
export type CreateCustomer = z.infer<typeof CreateCustomerSchema>;
export const UpdateCustomerSchema = CreateCustomerSchema.partial().omit({ code: true });
export interface CustomerDto {
  id: string; code: string; name: string; contactPerson: string | null;
  phone: string; altPhone: string | null; email: string | null; address: string | null;
  isGuest: boolean; status: 'active' | 'inactive'; createdAt: string;
}

export const CreateSupplierSchema = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(2).max(300),
  phone: z.string().min(7).max(25),
  contactPerson: z.string().max(200).nullish(),
  altPhone: z.string().max(25).nullish(),
  email: z.string().email().max(200).nullish(),
  address: z.string().max(500).nullish(),
  status: PartyStatusSchema.optional(),
});
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;
export const UpdateSupplierSchema = CreateSupplierSchema.partial().omit({ code: true });
export interface SupplierDto {
  id: string; code: string; name: string; contactPerson: string | null;
  phone: string; altPhone: string | null; email: string | null; address: string | null;
  status: 'active' | 'inactive'; createdAt: string;
}

export const PostPartyOpeningBalanceSchema = z.object({
  partyType: z.enum(['customer', 'supplier']),
  partyId: uuid(),
  amount: z.string().regex(/^-?\d{1,14}(\.\d{1,4})?$/, 'signed decimal(18,4) as string'),
  note: z.string().max(1000).optional(),
});
export type PostPartyOpeningBalance = z.infer<typeof PostPartyOpeningBalanceSchema>;
export interface PartyOpeningBalanceDto {
  id: string; partyType: 'customer' | 'supplier'; partyId: string;
  amount: string; note: string | null; status: 'posted' | 'cancelled'; createdAt: string;
}

/* --------------------------------- pricing -------------------------------- */

export const CreatePriceListSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(200),
  kind: z.enum(['standard', 'customer']),
  customerId: uuid().nullish(),
});
export type CreatePriceList = z.infer<typeof CreatePriceListSchema>;
export interface PriceListDto {
  id: string; code: string; name: string; kind: 'standard' | 'customer';
  customerId: string | null; isActive: boolean;
}

export const CreatePriceListItemSchema = z.object({
  productId: uuid(),
  unitId: uuid(),
  price: money(),
  effectiveFrom: isoDate(),
  effectiveTo: isoDate().nullish(),
});
export type CreatePriceListItem = z.infer<typeof CreatePriceListItemSchema>;
export interface PriceListItemDto {
  id: string; priceListId: string; productId: string; unitId: string;
  price: string; effectiveFrom: string; effectiveTo: string | null;
}

export const ClosePriceListItemSchema = z.object({ effectiveTo: isoDate() });
export type ClosePriceListItem = z.infer<typeof ClosePriceListItemSchema>;

export const ResolvePriceQuerySchema = z.object({
  productId: uuid(),
  unitId: uuid(),
  customerId: uuid().optional(),
  date: isoDate().optional(),
});
export type ResolvePriceQuery = z.infer<typeof ResolvePriceQuerySchema>;
export interface ResolvedPriceDto {
  price: string;
  source: 'customer_list' | 'standard_list' | 'product_default';
  priceListId: string | null;
  priceListItemId: string | null;
  effectiveFrom: string | null;
}

/* -------------------------------- inventory ------------------------------- */

export type StockMovementDto = {
  id: string; warehouseId: string; productId: string;
  movementType: 'receipt' | 'issue' | 'transfer_out' | 'transfer_in' | 'adjustment' | 'count_variance' | 'reversal';
  quantityBase: string;
  unitId: string | null; quantityTransacted: string | null; conversionFactor: string | null;
  reason: string | null; sourceDocumentType: string | null; sourceDocumentId: string | null;
  transferId: string | null; reversalOf: string | null; occurredAt: string;
};

export const MovementEntrySchema = z.object({
  warehouseId: uuid(),
  productId: uuid(),
  movementType: z.enum(['receipt', 'issue', 'transfer_out', 'transfer_in', 'adjustment', 'count_variance', 'reversal']),
  quantityBase: qty(),
  unitId: uuid().nullish(),
  quantityTransacted: qty().nullish(),
  /** OPTIMISTIC EXPECTATION ONLY — the authoritative factor is resolved
   *  server-side from product_unit configuration; a mismatch is rejected. */
  conversionFactor: qty().nullish(),
  reason: z.string().max(200).nullish(),
});
export type MovementEntryInput = z.infer<typeof MovementEntrySchema>;

export interface StockBalanceDto {
  warehouseId: string; productId: string; quantityBase: string; bin: string | null; updatedAt: string;
}

export const RebuildBalancesSchema = z.object({
  dryRun: z.boolean().optional(),
  warehouseId: uuid().optional(),
});
export type RebuildBalances = z.infer<typeof RebuildBalancesSchema>;
export interface BalanceRebuildReportDto {
  checked: number;
  mismatches: Array<{ warehouseId: string; productId: string; balance: string; computed: string }>;
  rebuilt: number;
  dryRun: boolean;
}

/* ------------------------------ stock counts ------------------------------ */

export const CreateStockCountSchema = z.object({
  warehouseId: uuid(),
  code: z.string().min(2).max(40).optional(),
  note: z.string().max(2000).nullish(),
  authority: z.enum(['physical_count', 'legacy_quantity', 'system_entry']).optional(),
  acceptedMigrationRisk: z.boolean().optional(),
  sourceEvidence: z.string().max(1000).nullish(),
  lines: z.array(z.object({
    productId: uuid(),
    countedQuantityBase: qty().nullish(),
  })).min(1).max(2000),
});
export type CreateStockCount = z.infer<typeof CreateStockCountSchema>;
export const UpdateCountLinesSchema = z.object({
  lines: z.array(z.object({
    productId: uuid(),
    countedQuantityBase: qty().nullish(),
  })).min(1).max(2000),
});
export type UpdateCountLines = z.infer<typeof UpdateCountLinesSchema>;
export const SubmitCountSchema = z.object({ countedBy: z.string().min(2).max(120).optional() });
export type SubmitCount = z.infer<typeof SubmitCountSchema>;
export const ApproveCountSchema = z.object({ note: z.string().max(2000).optional() });
export type ApproveCount = z.infer<typeof ApproveCountSchema>;

export interface StockCountLineDto {
  id: string; productId: string;
  countedQuantityBase: string | null; systemQuantityBase: string;
}
export interface StockCountDto {
  id: string; code: string; warehouseId: string;
  status: 'draft' | 'counted' | 'approved' | 'cancelled';
  authority: 'physical_count' | 'legacy_quantity' | 'system_entry';
  acceptedMigrationRisk: boolean; sourceEvidence: string | null;
  countedBy: string | null; countedAt: string | null;
  approvedBy: string | null; approvedAt: string | null;
  note: string | null; lines: StockCountLineDto[]; createdAt: string;
}

/* ------------------------------ adjustments ------------------------------- */

export const CreateStockAdjustmentSchema = z.object({
  warehouseId: uuid(),
  reason: z.string().min(3).max(500),
  code: z.string().min(2).max(40).optional(),
  sourceCountId: uuid().nullish(),
  note: z.string().max(2000).nullish(),
  lines: z.array(z.object({
    productId: uuid(),
    quantityBase: qty(),
    /** optional cross-unit evidence: the SERVER resolves the factor from
     *  product_unit configuration and computes |quantityBase| from
     *  transacted × configured factor; these fields are optimistic
     *  expectations compared against server configuration (409 on drift) */
    unitId: uuid().nullish(),
    quantityTransacted: qty().nullish(),
    conversionFactor: qty().nullish(),
    note: z.string().max(500).nullish(),
  })).min(1).max(2000),
});
export type CreateStockAdjustment = z.infer<typeof CreateStockAdjustmentSchema>;
export interface StockAdjustmentLineDto {
  id: string; productId: string; quantityBase: string; note: string | null;
}
export interface StockAdjustmentDto {
  id: string; code: string; warehouseId: string;
  status: 'posted' | 'cancelled'; reason: string;
  sourceCountId: string | null; postedBy: string | null; postedAt: string;
  note: string | null; lines: StockAdjustmentLineDto[]; createdAt: string;
}

/* -------------------------------- transfers ------------------------------- */

/** A product may appear at most once per transfer payload — duplicate lines
 *  could bypass the dispatched-quantity check and fall through to a database
 *  constraint error instead of a clean business rejection (review fix 6). */
export const CreateTransferSchema = z.object({
  fromWarehouseId: uuid(),
  toWarehouseId: uuid(),
  code: z.string().min(2).max(40).optional(),
  note: z.string().max(2000).nullish(),
  lines: z.array(z.object({ productId: uuid(), quantityBase: qty() })).min(1).max(2000),
}).refine(
  (dto) => new Set(dto.lines.map((l) => l.productId)).size === dto.lines.length,
  { message: 'duplicate productId in transfer lines: each product may appear at most once' },
);
export type CreateTransfer = z.infer<typeof CreateTransferSchema>;
export const ReceiveTransferSchema = z.object({
  lines: z.array(z.object({ productId: uuid(), quantityBase: qty() })).min(1).max(2000),
  /** injects a failure AFTER partial writes — proves all-or-nothing rollback */
  simulateFailureAfterWrites: z.boolean().optional(),
}).refine(
  (dto) => new Set(dto.lines.map((l) => l.productId)).size === dto.lines.length,
  { message: 'duplicate productId in transfer lines: each product may appear at most once' },
);
export type ReceiveTransfer = z.infer<typeof ReceiveTransferSchema>;

export interface TransferLineDto {
  id: string; productId: string; quantityBase: string; receivedQuantityBase: string;
}
export interface TransferDto {
  id: string; code: string; fromWarehouseId: string; toWarehouseId: string;
  status: 'draft' | 'in_transit' | 'received' | 'cancelled';
  dispatchedAt: string | null; dispatchedBy: string | null;
  receivedAt: string | null; receivedBy: string | null;
  note: string | null; lines: TransferLineDto[]; createdAt: string;
}

/* ================================ Phase 3 ================================= */
/* Sales & POS. Money is decimal(18,4) as string; quantities decimal(18,6).   */

/* ---------------------------- document sequences -------------------------- */

export const CreateSequenceSchema = z.object({
  docType: z.enum(['QUOTATION', 'SALE_ORDER', 'INVOICE', 'RECEIPT', 'WAYBILL', 'DEPOSIT']),
  prefix: z.string().min(1).max(16),
  branchId: uuid().nullish(),
  padding: z.number().int().min(1).max(12).optional(),
});
export type CreateSequence = z.infer<typeof CreateSequenceSchema>;
export interface DocumentSequenceDto {
  id: string; docType: string; prefix: string; branchId: string | null;
  nextValue: number; padding: number;
}

/** Pre-printed booklet import (document-numbering §2): codes are imported
 *  verbatim, kept unique, allocated in order with locking, spoilage keeps
 *  the reason — the legacy booklet workflow preserved without the races. */
export const ImportBookletSchema = z.object({
  docType: z.enum(['INVOICE', 'WAYBILL']),
  codes: z.array(z.string().min(1).max(40)).min(1).max(5000),
  codeRange: z.string().max(80).optional(),
});
export type ImportBooklet = z.infer<typeof ImportBookletSchema>;
export interface BookletDto {
  id: string; docType: string; codeRange: string | null; codeCount: number;
  openCount: number; createdBy: string | null; createdAt: string;
}
export interface BookletCodeDto {
  id: string; bookletId: string; code: string;
  status: 'open' | 'allocated' | 'not_used'; reason: string | null;
}

export const SpoilCodeSchema = z.object({ reason: z.string().min(10).max(500) });
export type SpoilCode = z.infer<typeof SpoilCodeSchema>;

/** Offline device lease: a contiguous numeric range a terminal may number
 *  offline sales with; reconciliation happens at sync (offline-sync §3). */
export const IssueLeaseSchema = z.object({
  deviceId: uuid(),
  docType: z.enum(['INVOICE', 'RECEIPT', 'SALE_ORDER', 'WAYBILL']),
  size: z.number().int().min(1).max(1000).optional(),
});
export type IssueLease = z.infer<typeof IssueLeaseSchema>;
export interface SequenceLeaseDto {
  id: string; deviceId: string; docType: string;
  startValue: number; endValue: number; prefix: string;
  issuedAt: string; expiresAt: string;
}

/* -------------------------------- shifts ---------------------------------- */

export const OpenShiftSchema = z.object({
  warehouseId: uuid(),
  deviceId: uuid().nullish(),
  openingFloat: money(),
});
export type OpenShift = z.infer<typeof OpenShiftSchema>;

export const ShiftCashMovementSchema = z.object({
  direction: z.enum(['in', 'out']),
  amount: money(),
  reason: z.string().min(3).max(300),
});
export type ShiftCashMovement = z.infer<typeof ShiftCashMovementSchema>;

export const CloseShiftSchema = z.object({
  countedCash: money(),
  note: z.string().max(2000).nullish(),
});
export type CloseShift = z.infer<typeof CloseShiftSchema>;

export interface ShiftCashMovementDto {
  id: string; shiftId: string; direction: 'in' | 'out';
  amount: string; reason: string; createdAt: string;
}
export interface ShiftDto {
  id: string; code: string; userId: string; userName: string | null;
  deviceId: string | null; warehouseId: string;
  status: 'open' | 'closed'; openingFloat: string;
  openedAt: string; closedAt: string | null;
  expectedCash: string | null; countedCash: string | null; variance: string | null;
  note: string | null; movements: ShiftCashMovementDto[]; createdAt: string;
}

/* ------------------------------ sale / invoice ----------------------------- */

export const SaleLineSchema = z.object({
  productId: uuid(),
  quantityBase: qty().nullish(),
  /** cross-unit evidence: the server resolves the configured factor
   *  authoritatively (Phase 2 review fix 3 semantics apply to sales too) */
  unitId: uuid().nullish(),
  quantityTransacted: qty().nullish(),
  conversionFactor: qty().nullish(),
  /** the agreed transacted price (what the customer pays for ONE transacted
   *  unit); the server computes line.net — client amounts are advisory (C-1) */
  unitPrice: money(),
  note: z.string().max(300).nullish(),
});
export type SaleLineInput = z.infer<typeof SaleLineSchema>;

export const TenderSchema = z.object({
  method: z.enum(['cash', 'momo', 'cheque', 'bank_transfer', 'credit']),
  amount: money(),
  depositId: uuid().nullish(),
  momoProvider: z.enum(['MTN', 'Vodafone', 'AirtelTigo']).nullish(),
  momoPhone: z.string().max(25).nullish(),
  momoTransactionId: z.string().max(80).nullish(),
  chequeBank: z.string().max(120).nullish(),
  chequeBranch: z.string().max(120).nullish(),
  chequeNumber: z.string().max(80).nullish(),
  reference: z.string().max(120).nullish(),
});
export type TenderDto = z.infer<typeof TenderSchema>;

/** The atomic POS/counter sale: invoice + stock issues + tenders (+ credit
 *  applications) + audit + outbox commit in ONE transaction (ROADMAP Phase 3
 *  posting rule). clientDocId makes an offline capture replay-safe. */
export const CommitSaleSchema = z.object({
  warehouseId: uuid(),
  customerId: uuid().nullish(),
  shiftId: uuid().nullish(),
  note: z.string().max(2000).nullish(),
  orderDiscount: money().optional(),
  lines: z.array(SaleLineSchema).min(1).max(2000).refine(
    (lines) => new Set(lines.map((l) => l.productId)).size === lines.length,
    { message: 'duplicate productId in sale lines: each product may appear at most once' },
  ),
  tenders: z.array(TenderSchema).max(10).default([]),
  /** offline capture identity (UUIDv7, client-generated) */
  clientDocId: uuid().nullish(),
  /** offline-leased document number (invoice); server-allocated when absent */
  docNumber: z.string().min(1).max(40).nullish(),
  /** offline business time — recorded, server received_at authoritative */
  occurredAt: z.string().datetime().nullish(),
  /** injects a failure AFTER deep partial writes (invoice+lines+stock+
   *  tenders) — proves the whole posting set rolls back (atomicity test) */
  simulateFailureAfterWrites: z.boolean().optional(),
});
export type CommitSale = z.infer<typeof CommitSaleSchema>;

export interface InvoiceLineDto {
  id: string; productId: string; unitId: string | null;
  quantity: string; quantityBase: string;
  unitPrice: string; lineNet: string;
  resolvedPrice: string | null; priceSource: string | null; priceOverridden: boolean;
  costAtSale: string | null; note: string | null;
}
export interface InvoiceDto {
  id: string; code: string; salesOrderId: string | null;
  customerId: string | null; customerName: string | null; warehouseId: string;
  status: 'posted' | 'voided';
  paymentStatus: 'unpaid' | 'part_paid' | 'paid' | 'over_paid';
  subtotal: string; orderDiscount: string; total: string;
  amountPaid: string; amountDue: string; costTotal: string | null;
  changeGiven: string; shiftId: string | null; source: string;
  clientDocId: string | null; note: string | null;
  lines: InvoiceLineDto[]; createdBy: string | null; createdAt: string;
}

/* -------------------------------- payments --------------------------------- */

export const ReceivePaymentSchema = z.object({
  customerId: uuid(),
  invoiceId: uuid().nullish(),
  amount: money(),
  tenders: z.array(TenderSchema.omit({ depositId: true })).min(1).max(10),
  /** explicit allocation targets; when empty the receipt auto-allocates
   *  oldest-invoice-first (legacy FIFO preserved, but with explicit rows) */
  allocations: z.array(z.object({ invoiceId: uuid(), amount: money() })).max(200).optional(),
  shiftId: uuid().nullish(),
  clientDocId: uuid().nullish(),
  occurredAt: z.string().datetime().nullish(),
}).refine(
  (dto) => {
    const tenderSum = dto.tenders.reduce((acc, t) => acc + Number(t.amount), 0);
    return Math.abs(tenderSum - Number(dto.amount)) < 5e-5;
  },
  { message: 'Σ tenders must equal the payment amount' },
);
export type ReceivePayment = z.infer<typeof ReceivePaymentSchema>;

export interface PaymentTenderDto {
  id: string; method: 'cash' | 'momo' | 'cheque' | 'bank_transfer' | 'credit';
  amount: string; momoProvider: string | null; momoPhone: string | null;
  momoTransactionId: string | null; chequeBank: string | null; chequeBranch: string | null;
  chequeNumber: string | null; reference: string | null;
}
export interface PaymentAllocationDto {
  id: string; invoiceId: string; invoiceCode: string | null; amount: string;
}
export interface PaymentDto {
  id: string; code: string; customerId: string; customerName: string | null;
  amount: string; changeGiven: string; unapplied: string;
  shiftId: string | null; clientDocId: string | null; source: string;
  tenders: PaymentTenderDto[]; allocations: PaymentAllocationDto[];
  createdBy: string | null; createdAt: string;
}

/* -------------------------- deposits / credits ----------------------------- */

export const CreateDepositSchema = z.object({
  customerId: uuid(),
  amount: money(),
  tenders: z.array(TenderSchema.omit({ depositId: true }).extend({ method: z.enum(['cash', 'momo', 'cheque', 'bank_transfer']) })).min(1).max(10),
  shiftId: uuid().nullish(),
  note: z.string().max(500).nullish(),
  clientDocId: uuid().nullish(),
});
export type CreateDeposit = z.infer<typeof CreateDepositSchema>;

export const ApplyCreditSchema = z.object({
  depositId: uuid(),
  invoiceId: uuid(),
  amount: money(),
});
export type ApplyCredit = z.infer<typeof ApplyCreditSchema>;

export interface CustomerDepositDto {
  id: string; code: string; customerId: string; customerName: string | null;
  amount: string; appliedAmount: string; remainingAmount: string;
  paymentId: string | null; status: 'active' | 'exhausted';
  note: string | null; createdBy: string | null; createdAt: string;
}
export interface CreditApplicationDto {
  id: string; depositId: string; depositCode: string | null;
  invoiceId: string; invoiceCode: string | null; amount: string; createdAt: string;
}

/* -------------------------- quotations / orders ---------------------------- */

export const CreateQuotationSchema = z.object({
  warehouseId: uuid(),
  customerId: uuid().nullish(),
  note: z.string().max(2000).nullish(),
  validUntil: isoDate().nullish(),
  lines: z.array(z.object({
    productId: uuid(),
    unitId: uuid().nullish(),
    quantityTransacted: qty().nullish(),
    quantityBase: qty().nullish(),
    unitPrice: money(),
  })).min(1).max(2000).refine(
    (lines) => new Set(lines.map((l) => l.productId)).size === lines.length,
    { message: 'duplicate productId in quotation lines' },
  ),
});
export type CreateQuotation = z.infer<typeof CreateQuotationSchema>;
export interface QuotationLineDto {
  id: string; productId: string; unitId: string | null;
  quantity: string; quantityBase: string; unitPrice: string; lineNet: string;
}
export interface QuotationDto {
  id: string; code: string; warehouseId: string; customerId: string | null;
  customerName: string | null; status: 'draft' | 'converted' | 'cancelled';
  subtotal: string; total: string; validUntil: string | null;
  convertedOrderId: string | null; note: string | null;
  lines: QuotationLineDto[]; createdBy: string | null; createdAt: string;
}

export const CreateSalesOrderSchema = z.object({
  warehouseId: uuid(),
  customerId: uuid().nullish(),
  quotationId: uuid().nullish(),
  note: z.string().max(2000).nullish(),
  orderDiscount: money().optional(),
  lines: z.array(z.object({
    productId: uuid(),
    unitId: uuid().nullish(),
    quantityTransacted: qty().nullish(),
    quantityBase: qty().nullish(),
    unitPrice: money(),
  })).min(1).max(2000).refine(
    (lines) => new Set(lines.map((l) => l.productId)).size === lines.length,
    { message: 'duplicate productId in order lines' },
  ),
});
export type CreateSalesOrder = z.infer<typeof CreateSalesOrderSchema>;

export const ConfirmSalesOrderSchema = z.object({
  tenders: z.array(TenderSchema).max(10).default([]),
  shiftId: uuid().nullish(),
});
export type ConfirmSalesOrder = z.infer<typeof ConfirmSalesOrderSchema>;

export interface SalesOrderLineDto {
  id: string; productId: string; unitId: string | null;
  quantity: string; quantityBase: string; unitPrice: string; lineNet: string;
  fulfilledQuantityBase: string;
}
export interface SalesOrderDto {
  id: string; code: string; warehouseId: string; customerId: string | null;
  customerName: string | null;
  status: 'draft' | 'confirmed' | 'partially_fulfilled' | 'fulfilled' | 'closed' | 'cancelled';
  subtotal: string; orderDiscount: string; total: string;
  invoiceId: string | null; invoiceCode: string | null;
  quotationId: string | null; note: string | null;
  lines: SalesOrderLineDto[]; createdBy: string | null; createdAt: string;
  confirmedAt: string | null;
}

/* ------------------------------ fulfillments ------------------------------- */

export const CreateFulfillmentSchema = z.object({
  salesOrderId: uuid(),
  code: z.string().min(2).max(40).optional(),
  note: z.string().max(2000).nullish(),
  lines: z.array(z.object({
    orderLineId: uuid(),
    quantityBase: qty(),
  })).min(1).max(2000),
});
export type CreateFulfillment = z.infer<typeof CreateFulfillmentSchema>;

export interface FulfillmentLineDto {
  id: string; orderLineId: string; productId: string; quantityBase: string;
}
export interface FulfillmentDto {
  id: string; code: string; salesOrderId: string; salesOrderCode: string | null;
  warehouseId: string; status: 'draft' | 'dispatched' | 'delivered' | 'cancelled';
  dispatchedBy: string | null; dispatchedAt: string | null;
  deliveredBy: string | null; deliveredAt: string | null;
  note: string | null; lines: FulfillmentLineDto[]; createdBy: string | null; createdAt: string;
}

/* --------------------------------- sync ------------------------------------ */

/** Offline push envelope (offline-sync §4): batched, dependency-ordered,
 *  idempotent by eventId; the server applies each event in exactly one PG
 *  transaction through the same posting coordinator as online commands. */
export const SyncPushSchema = z.object({
  deviceId: uuid(),
  events: z.array(z.object({
    eventId: uuid(),
    idempotencyKey: z.string().min(8).max(120),
    type: z.enum(['sale.create', 'payment.receive', 'deposit.create', 'customer.create']),
    payload: z.unknown(),
    occurredAt: z.string().datetime().nullish(),
  })).min(1).max(200),
});
export type SyncPush = z.infer<typeof SyncPushSchema>;

export type SyncEventOutcome =
  | { eventId: string; status: 'applied'; result: Record<string, unknown> }
  | { eventId: string; status: 'duplicate'; result: Record<string, unknown> }
  | { eventId: string; status: 'conflict'; code: string; message: string }
  | { eventId: string; status: 'rejected'; code: string; message: string };
export interface SyncPushResponseDto {
  outcomes: SyncEventOutcome[];
  serverTime: string;
}

export const SyncPullQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});
/** Device-replica pull page (offline-sync §4 pull): resumable cursor over
 *  the tenant's committed-fact stream. */
export interface ChangeFeedEntryDto {
  id: string; type: string; payload: Record<string, unknown>; occurredAt: string; status: string;
}
export interface SyncPullResponseDto {
  entries: ChangeFeedEntryDto[];
  cursor: string | null;
  hasMore: boolean;
}

/* -------------------------------- receipts --------------------------------- */

/** Print payload for the hardware bridge / browser print (pos-hardware §4).
 *  Thermal and A4 templates render from the same payload. */
export interface ReceiptLinePayload {
  name: string; quantity: string; unitCode: string | null; unitPrice: string; lineNet: string;
}
export interface ReceiptPayloadDto {
  kind: 'receipt' | 'invoice_a4';
  businessName: string; businessPhone: string | null; businessAddress: string | null;
  code: string; occurredAt: string;
  customerName: string | null; customerPhone: string | null;
  cashierName: string | null;
  lines: ReceiptLinePayload[];
  subtotal: string; orderDiscount: string; total: string;
  tenders: Array<{ method: string; amount: string; detail: string | null }>;
  changeGiven: string; amountDue: string;
  balanceOwedThisInvoice: string;
  note: string | null;
}
