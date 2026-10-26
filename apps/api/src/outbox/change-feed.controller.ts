import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parseBody } from '../parse-body.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { ChangeFeedService } from './change-feed.service.js';

const AckSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/**
 * Change-feed primitives (Phase 1): ordered projection feed over the
 * transactional outbox. Consumers may ONLY project — never perform
 * financially authoritative posting (target-architecture §4.3).
 */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('internal/change-feed')
export class ChangeFeedController {
  constructor(private readonly feed: ChangeFeedService) {}

  @Get()
  @RequirePermissions('outbox:read')
  list(
    @Req() req: Request,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    const max = Math.min(Math.max(Number(limit ?? 100), 1), 500);
    return this.feed.list(req.principal!, after, max);
  }

  @Post('ack')
  @RequirePermissions('outbox:ack')
  ack(@Req() req: Request, @Body() body: unknown) {
    return this.feed.ack(req.principal!, parseBody(AckSchema, body));
  }
}
