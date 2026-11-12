/**
 * Wire shapes mirrored from the API controllers / packages/contracts.
 * apps/web is standalone JS-land (no @idepot/contracts import) — keep these
 * in sync with packages/contracts/src/index.ts and the controllers.
 */

/* ---------------------------------- auth ---------------------------------- */

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  tenantId: string;
  tenantSlug: string;
}

/** POST /api/auth/login response (TokenPair). */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SessionUser;
}

/** What we persist in localStorage under 'idepot.session'. */
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

/* ------------------------------- shared list ------------------------------ */

export interface ListDto<T> {
  items: T[];
  total: number;
}

/* -------------------------------- warehouse ------------------------------- */

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

/* --------------------------------- catalog -------------------------------- */

export interface UnitDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface CategoryDto {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  isActive: boolean;
}

export type ProductStatus = 'active' | 'inactive' | 'archived';

export interface ProductDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  supplierId: string | null;
  brandId: string | null;
  baseUnitId: string;
  defaultSaleUnitId: string | null;
  soldInUnits: boolean;
  sellingPrice: string;
  purchasePrice: string | null;
  status: ProductStatus;
  createdAt: string;
}

export interface ProductUnitDto {
  id: string;
  productId: string;
  unitId: string;
  unitCode: string | null;
  conversionFactor: string;
  price: string | null;
  isDefaultSale: boolean;
}

export interface ProductBarcodeDto {
  id: string;
  productId: string;
  barcode: string;
  isPrimary: boolean;
}

/* --------------------------------- parties -------------------------------- */

export type PartyStatus = 'active' | 'inactive';

export interface CustomerDto {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  isGuest: boolean;
  status: PartyStatus;
  createdAt: string;
}

export interface SupplierDto {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  address: string | null;
  status: PartyStatus;
  createdAt: string;
}

/* -------------------------------- inventory ------------------------------- */

export type MovementType =
  | 'receipt'
  | 'issue'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment'
  | 'count_variance'
  | 'reversal';

export interface StockMovementDto {
  id: string;
  warehouseId: string;
  productId: string;
  movementType: MovementType;
  quantityBase: string;
  unitId: string | null;
  quantityTransacted: string | null;
  conversionFactor: string | null;
  reason: string | null;
  sourceDocumentType: string | null;
  sourceDocumentId: string | null;
  transferId: string | null;
  reversalOf: string | null;
  occurredAt: string;
}

export interface StockBalanceDto {
  warehouseId: string;
  productId: string;
  quantityBase: string;
  bin: string | null;
  updatedAt: string;
}

export interface BalanceMismatch {
  warehouseId: string;
  productId: string;
  balance: string;
  computed: string;
}

export interface BalanceRebuildReportDto {
  checked: number;
  mismatches: BalanceMismatch[];
  rebuilt: number;
  dryRun: boolean;
}

/* ------------------------------ stock counts ------------------------------ */

export type StockCountStatus = 'draft' | 'counted' | 'approved' | 'cancelled';

export interface StockCountLineDto {
  id: string;
  productId: string;
  countedQuantityBase: string | null;
  systemQuantityBase: string;
}

export interface StockCountDto {
  id: string;
  code: string;
  warehouseId: string;
  status: StockCountStatus;
  authority: 'physical_count' | 'legacy_quantity' | 'system_entry';
  acceptedMigrationRisk: boolean;
  sourceEvidence: string | null;
  countedBy: string | null;
  countedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  note: string | null;
  lines: StockCountLineDto[];
  createdAt: string;
}

/* ------------------------------ adjustments ------------------------------- */

export interface StockAdjustmentLineDto {
  id: string;
  productId: string;
  quantityBase: string;
  note: string | null;
}

export interface StockAdjustmentDto {
  id: string;
  code: string;
  warehouseId: string;
  status: 'posted' | 'cancelled';
  reason: string;
  sourceCountId: string | null;
  postedBy: string | null;
  postedAt: string;
  note: string | null;
  lines: StockAdjustmentLineDto[];
  createdAt: string;
}

/* -------------------------------- transfers ------------------------------- */

export type TransferStatus = 'draft' | 'in_transit' | 'received' | 'cancelled';

export interface TransferLineDto {
  id: string;
  productId: string;
  quantityBase: string;
  receivedQuantityBase: string;
}

export interface TransferDto {
  id: string;
  code: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: TransferStatus;
  dispatchedAt: string | null;
  dispatchedBy: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  note: string | null;
  lines: TransferLineDto[];
  createdAt: string;
}

/* ================================ Phase 3 ================================= */

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

export interface QuotationLineDto {
  id: string; productId: string; unitId: string | null;
  quantity: string; quantityBase: string; unitPrice: string; lineNet: string;
}

export interface QuotationDto {
  id: string; code: string; warehouseId: string; customerId: string | null;
  customerName: string | null;
  status: 'draft' | 'issued' | 'accepted' | 'rejected' | 'expired' | 'converted' | 'cancelled';
  subtotal: string; total: string; validUntil: string | null;
  convertedOrderId: string | null; note: string | null;
  issuedAt: string | null; acceptedAt: string | null; statusReason: string | null;
  lines: QuotationLineDto[]; createdBy: string | null; createdAt: string;
}

/* ----------------------- Phase 6 parity: price lists ---------------------- */

export interface PriceListDto {
  id: string; code: string; name: string; kind: 'standard' | 'customer';
  customerId: string | null; isActive: boolean;
}
export interface PriceListItemViewDto {
  id: string; priceListId: string; productId: string; unitId: string;
  price: string; effectiveFrom: string; effectiveTo: string | null;
  productCode: string | null; productName: string | null; unitCode: string | null;
}
export interface ResolvedPriceDto {
  price: string; source: 'customer_list' | 'standard_list' | 'product_default';
  priceListId: string | null; priceListItemId: string | null; effectiveFrom: string | null;
}

/* --------------------- Phase 6 parity: global search ---------------------- */

export interface SearchResultDto {
  entity:
    | 'product' | 'customer' | 'supplier' | 'invoice' | 'quotation'
    | 'sales_order' | 'waybill' | 'credit_note' | 'purchase_order'
    | 'goods_receipt' | 'price_list';
  id: string;
  code: string | null;
  title: string;
  subtitle: string | null;
  href: string;
  status: string | null;
  when: string | null;
}
export interface SearchResultsDto {
  q: string;
  total: number;
  groups: Array<{ entity: SearchResultDto['entity']; items: SearchResultDto[] }>;
}
