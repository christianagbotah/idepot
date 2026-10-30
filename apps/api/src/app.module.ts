import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DbModule } from './db/db.module.js';
import { AuthService, TenancyLookupService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RbacGuard } from './rbac/rbac.guard.js';
import { DomainExceptionFilter } from './domain-exception.filter.js';
import { WarehouseController } from './warehouse/warehouse.controller.js';
import { WarehouseService } from './warehouse/warehouse.service.js';
import { WarehouseRepository } from './warehouse/warehouse.repository.js';
import { SampleDocumentController } from './documents/sample-document.controller.js';
import { SampleDocumentService } from './documents/sample-document.service.js';
import { ChangeFeedController } from './outbox/change-feed.controller.js';
import { ChangeFeedService } from './outbox/change-feed.service.js';
import { HealthController } from './health.controller.js';
import { InventoryController, StockAdjustmentController, StockCountController, TransferController } from './inventory/inventory.controller.js';
import { StockPoster } from './inventory/stock-poster.js';
import { StockCountService } from './inventory/stock-count.service.js';
import { StockAdjustmentService } from './inventory/stock-adjustment.service.js';
import { TransferService } from './inventory/transfer.service.js';
import { OpeningStockService } from './inventory/opening-stock.service.js';
import { BalanceRebuildService, InventoryReadService } from './inventory/balance-rebuild.service.js';
// Phase 2 — catalog / parties / pricing
import { ProductController } from './catalog/product.controller.js';
import { ProductService } from './catalog/product.service.js';
import { ProductRepository } from './catalog/product.repository.js';
import { CatalogReferenceController } from './catalog/catalog-reference.controller.js';
import { CatalogReferenceService } from './catalog/catalog-reference.service.js';
import { CatalogReferenceRepository } from './catalog/catalog-reference.repository.js';
import { CustomerController, SupplierController, PartyOpeningBalanceController } from './parties/party.controller.js';
import { PartyService } from './parties/party.service.js';
import { PartyRepository } from './parties/party.repository.js';
import { PricingController } from './pricing/pricing.controller.js';
import { PricingService } from './pricing/pricing.service.js';
import { PricingRepository } from './pricing/pricing.repository.js';
// Phase 3 — sales & POS
import { SalesController, PaymentController, DepositController, CreditController, CustomerBalanceController, QuotationController, SalesOrderController, FulfillmentController, ShiftController, SequenceController, SyncController } from './sales/sales.controller.js';
import { DocumentSequenceService } from './sales/document-sequence.service.js';
import { SalePoster } from './sales/sale-poster.js';
import { PaymentService } from './sales/payment.service.js';
import { OrderService } from './sales/order.service.js';
import { ShiftService } from './sales/shift.service.js';
import { ReceiptService } from './sales/receipt.service.js';
import { SyncService } from './sales/sync.service.js';

@Module({
  imports: [DbModule],
  controllers: [
    AuthController,
    WarehouseController,
    SampleDocumentController,
    ChangeFeedController,
    HealthController,
    InventoryController,
    StockCountController,
    StockAdjustmentController,
    TransferController,
    ProductController,
    CatalogReferenceController,
    CustomerController,
    SupplierController,
    PartyOpeningBalanceController,
    PricingController,
    // Phase 3 — sales & POS
    SalesController,
    PaymentController,
    DepositController,
    CreditController,
    CustomerBalanceController,
    QuotationController,
    SalesOrderController,
    FulfillmentController,
    ShiftController,
    SequenceController,
    SyncController,
  ],
  providers: [
    AuthService,
    TenancyLookupService,
    WarehouseService,
    WarehouseRepository,
    SampleDocumentService,
    ChangeFeedService,
    // Phase 2 — inventory (all authoritative writes via StockPoster inside the UoW)
    StockPoster,
    StockCountService,
    StockAdjustmentService,
    TransferService,
    OpeningStockService,
    BalanceRebuildService,
    InventoryReadService,
    // Phase 2 — catalog / parties / pricing
    ProductService,
    ProductRepository,
    CatalogReferenceService,
    CatalogReferenceRepository,
    PartyService,
    PartyRepository,
    PricingService,
    PricingRepository,
    // Phase 3 — sales & POS (all money paths inside the UoW via SalePoster)
    DocumentSequenceService,
    SalePoster,
    PaymentService,
    OrderService,
    ShiftService,
    ReceiptService,
    SyncService,
    // global guard chain: authentication -> authorization
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
