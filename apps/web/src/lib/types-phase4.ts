/**
 * Phase 4 DTOs (apps/web is standalone JS-land — mirrors @idepot/contracts
 * by hand, same convention as lib/types.ts).
 */

export interface PurchaseOrderLineWebDto {
  id: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  orderedQuantity: string;
  orderedQuantityBase: string;
  unitPrice: string;
  lineDiscount: string;
  receivedQuantityBase: string;
  invoicedQuantityBase: string;
}

export interface PurchaseOrderWebDto {
  id: string;
  code: string;
  supplierId: string;
  supplierName: string | null;
  warehouseId: string;
  status: string;
  expectedDate: string | null;
  createdAt: string;
  lines: PurchaseOrderLineWebDto[];
}

export interface GrnWebDto {
  id: string;
  code: string;
  purchaseOrderId: string | null;
  purchaseOrderCode: string | null;
  supplierId: string;
  supplierName: string | null;
  warehouseId: string;
  businessDate: string;
  supplierDeliveryRef: string | null;
  status: string;
  totalValue: string;
  lines: Array<{
    id: string;
    productId: string;
    receivedQuantity: string;
    receivedQuantityBase: string;
    unitCost: string;
    lineValue: string;
  }>;
}

export interface SupplierInvoiceWebDto {
  id: string;
  code: string;
  supplierId: string;
  supplierName: string | null;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  dueDate: string | null;
  businessDate: string;
  status: string;
  matchState: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  amountAllocated: string;
  amountOpen: string;
  lines: Array<{
    id: string;
    description: string;
    quantityBase: string;
    unitPrice: string;
    lineNet: string;
  }>;
  matchItems: Array<{
    id: string;
    matchDimension: string;
    severity: string;
    expectedValue: string | null;
    actualValue: string | null;
    variance: string | null;
    approvedBy: string | null;
    approvalReason: string | null;
  }>;
}

export interface SupplierPaymentWebDto {
  id: string;
  code: string;
  supplierId: string;
  supplierName: string | null;
  businessDate: string;
  amount: string;
  method: string;
  reference: string | null;
  amountAllocated: string;
  amountUnapplied: string;
  createdAt: string;
  allocations: Array<{ supplierInvoiceId: string; supplierInvoiceCode: string | null; amount: string }>;
}

export interface SupplierAdjustmentWebDto {
  id: string;
  code: string;
  kind: string;
  supplierId: string;
  supplierName: string | null;
  supplierInvoiceCode: string | null;
  businessDate: string;
  reason: string;
  adjustmentClass: string;
  amount: string;
  postedAt: string;
}

export interface ApAgingWebDto {
  supplierId: string;
  supplierName: string | null;
  current: string;
  bucket_1_30: string;
  bucket_31_60: string;
  bucket_61_90: string;
  bucket_90_plus: string;
  total: string;
}

export interface SupplierStatementWebDto {
  supplierId: string;
  supplierName: string | null;
  asOf: string;
  closingBalance: string;
  lines: Array<{
    businessDate: string;
    documentCode: string;
    documentType: string;
    detail: string | null;
    debit: string;
    credit: string;
    runningOpen: string;
  }>;
}

export interface GlAccountWebDto {
  id: string;
  code: string;
  name: string;
  accountType: string;
  accountClass: string;
  parentCode: string | null;
  normalBalance: string;
  isPosting: boolean;
  isControl: boolean;
  isActive: boolean;
}

export interface JournalWebDto {
  id: string;
  sourceKind: string;
  event: string;
  description: string | null;
  occurredAt: string;
  totalDebit: string;
  totalCredit: string;
  reference: string | null;
  lines: Array<{
    id: string;
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
    memo: string | null;
  }>;
}

export interface AccountingPeriodWebDto {
  id: string;
  fiscalYear: number;
  periodNumber: number;
  periodName: string;
  startsOn: string;
  endsOn: string;
  status: string;
  reopenReason: string | null;
}

export interface TrialBalanceWebDto {
  asOf: string;
  balanced: boolean;
  rows: Array<{
    code: string;
    name: string;
    accountClass: string;
    openingDebit: string;
    openingCredit: string;
    periodDebit: string;
    periodCredit: string;
    closingDebit: string;
    closingCredit: string;
  }>;
  totalClosingDebit: string;
  totalClosingCredit: string;
}

export interface ProfitAndLossWebDto {
  from: string;
  to: string;
  totalRevenue: string;
  totalCostOfSales: string;
  grossProfit: string;
  totalOperatingExpenses: string;
  totalOtherIncome: string;
  totalOtherExpenses: string;
  netProfit: string;
  revenue: Array<{ accountCode: string; accountName: string; amount: string }>;
  costOfSales: Array<{ accountCode: string; accountName: string; amount: string }>;
  operatingExpenses: Array<{ accountCode: string; accountName: string; amount: string }>;
}

export interface BalanceSheetWebDto {
  asOf: string;
  balanced: boolean;
  difference: string;
  currentEarnings: string;
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  assets: Array<{ accountCode: string; accountName: string; amount: string }>;
  liabilities: Array<{ accountCode: string; accountName: string; amount: string }>;
  equity: Array<{ accountCode: string; accountName: string; amount: string }>;
}

export interface CashFlowWebDto {
  from: string;
  to: string;
  netProfit: string;
  netCashFromOperations: string;
  netCashMovement: string;
  unexplained: string;
  operatingAssetChanges: Array<{ accountCode: string; accountName: string; amount: string }>;
  operatingLiabilityChanges: Array<{ accountCode: string; accountName: string; amount: string }>;
  equityFinancing: Array<{ accountCode: string; accountName: string; amount: string }>;
}

export interface ReconciliationWebDto {
  asOf: string;
  checks: Array<{
    check: string;
    controlBalance: string;
    subledgerBalance: string;
    difference: string;
    passed: boolean;
    detail: string;
  }>;
}

export interface BankAccountWebDto {
  id: string;
  code: string;
  bankName: string;
  branch: string | null;
  accountName: string;
  accountNumber: string;
  currency: string;
  glAccountCode: string | null;
  isActive: boolean;
  glBalance: string;
}

export interface BankTransferWebDto {
  id: string;
  code: string;
  fromAccountCode: string | null;
  toAccountCode: string | null;
  businessDate: string;
  amount: string;
  fee: string;
  reference: string | null;
}

export interface BankStatementWebDto {
  id: string;
  bankAccountId: string;
  bankAccountCode: string | null;
  statementDate: string;
  filename: string;
  rowCount: number;
  importedAt: string;
  lines: Array<{
    id: string;
    lineNo: number;
    valueDate: string;
    reference: string | null;
    description: string | null;
    direction: string;
    amount: string;
    closingBalance: string | null;
    matchStatus: string;
    matchedAmount: string;
    matches: Array<{ journalLineId: string; amount: string }>;
  }>;
}

export interface BankMatchSuggestionWebDto {
  statementLineId: string;
  journalLineId: string;
  journalReference: string | null;
  amount: string;
  ruleName: string;
  confidence: string;
}

export interface BankReconciliationWebDto {
  id: string;
  bankAccountCode: string | null;
  asOf: string;
  statementClosingBalance: string | null;
  glClosingBalance: string;
  difference: string;
  status: string;
  finalizedAt: string | null;
}
