/**
 * Tenant user/staff administration endpoints (Phase 5 §16).
 *
 * All routes require `users:manage` (owner/admin only). The actor's own
 * account is deliberately not manageable through these routes — profile
 * self-service (display name + password change) lives under /auth/profile.
 */
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CreateUserSchema, ResetUserPasswordSchema, UpdateUserSchema } from '@idepot/contracts';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { parseBody } from '../parse-body.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class
import { UsersService } from './users.service.js';

type Principal = { userId: string; tenantId: string; displayName: string; roles: string[] };

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:manage')
  listUsers(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.users.listUsers(principalOf(req).tenantId, {
      status: status || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post()
  @RequirePermissions('users:manage')
  createUser(@Req() req: Request, @Body() body: unknown) {
    return this.users.createUser(principalOf(req), parseBody(CreateUserSchema, body));
  }

  @Patch(':id')
  @RequirePermissions('users:manage')
  updateUser(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.users.updateUser(principalOf(req), id, parseBody(UpdateUserSchema, body));
  }

  @Post(':id/reset-password')
  @RequirePermissions('users:manage')
  resetPassword(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.users.resetUserPassword(
      principalOf(req),
      id,
      parseBody(ResetUserPasswordSchema, body).password,
    );
  }
}
