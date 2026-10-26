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

@Module({
  imports: [DbModule],
  controllers: [
    AuthController,
    WarehouseController,
    SampleDocumentController,
    ChangeFeedController,
    HealthController,
  ],
  providers: [
    AuthService,
    TenancyLookupService,
    WarehouseService,
    WarehouseRepository,
    SampleDocumentService,
    ChangeFeedService,
    // global guard chain: authentication -> authorization
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
