import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type {
  LoginRequest,
  RefreshRequest,
  DeviceRegisterRequest,
  TokenPair,
} from '@idepot/contracts';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  DeviceRegisterRequestSchema,
} from '@idepot/contracts';
import { parseBody } from '../parse-body.js';
import { Public } from './public.decorator.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import type { Principal } from './jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: unknown): Promise<TokenPair> {
    return this.auth.login(parseBody(LoginRequestSchema, body));
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: unknown): Promise<TokenPair> {
    return this.auth.refresh(parseBody(RefreshRequestSchema, body));
  }

  @Post('devices')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions('device:register')
  async registerDevice(@Req() req: Request, @Body() body: unknown) {
    return this.auth.registerDevice(req.principal, parseBody(DeviceRegisterRequestSchema, body));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request): Principal {
    return req.principal;
  }
}
