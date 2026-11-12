import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CreateLoyaltyProgramSchema, EnrollLoyaltySchema } from '@idepot/contracts';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { parseBody } from '../parse-body.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class
import { AdminService } from './admin.service.js';

type Principal = { userId: string; tenantId: string; displayName: string; roles: string[] };

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

/** Optional loyalty foundation administration (Phase 5 §14 — programs are
 *  INACTIVE by default and require the audited loyalty.enabled setting). */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly admin: AdminService) {}

  @Get('programs')
  @RequirePermissions('loyalty:manage')
  listPrograms(@Req() req: Request) {
    return this.admin.listLoyaltyPrograms(principalOf(req).tenantId);
  }

  @Post('programs')
  @RequirePermissions('loyalty:manage')
  createProgram(@Req() req: Request, @Body() body: unknown) {
    return this.admin.createLoyaltyProgram(principalOf(req), parseBody(CreateLoyaltyProgramSchema, body));
  }

  @Post('programs/:id/activate')
  @RequirePermissions('loyalty:manage')
  activateProgram(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.setLoyaltyProgramActive(principalOf(req), id, true);
  }

  @Post('programs/:id/deactivate')
  @RequirePermissions('loyalty:manage')
  deactivateProgram(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.setLoyaltyProgramActive(principalOf(req), id, false);
  }

  @Post('enroll')
  @RequirePermissions('loyalty:manage')
  enroll(@Req() req: Request, @Body() body: unknown) {
    return this.admin.enrollLoyalty(principalOf(req), parseBody(EnrollLoyaltySchema, body));
  }
}
