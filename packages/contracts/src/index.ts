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
    /** optional cross-unit evidence: base == transacted × factor (exact) */
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

export const CreateTransferSchema = z.object({
  fromWarehouseId: uuid(),
  toWarehouseId: uuid(),
  code: z.string().min(2).max(40).optional(),
  note: z.string().max(2000).nullish(),
  lines: z.array(z.object({ productId: uuid(), quantityBase: qty() })).min(1).max(2000),
});
export type CreateTransfer = z.infer<typeof CreateTransferSchema>;
export const ReceiveTransferSchema = z.object({
  lines: z.array(z.object({ productId: uuid(), quantityBase: qty() })).min(1).max(2000),
  /** injects a failure AFTER partial writes — proves all-or-nothing rollback */
  simulateFailureAfterWrites: z.boolean().optional(),
});
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
