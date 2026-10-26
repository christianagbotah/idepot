import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import {
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  isRole,
} from '@idepot/auth';
import type {
  LoginRequest,
  TokenPair,
  RefreshRequest,
  DeviceRegisterRequest,
} from '@idepot/contracts';
import { UnauthorizedError } from '@idepot/domain';
import { PG_ADMIN_POOL, UnitOfWork } from '../db/unit-of-work.js';

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  display_name: string;
  roles: string[];
  status: string;
}

/** Read-only tenant resolution — the only request-time queries on the admin pool
 *  (RLS deliberately hides tenant rows from the app role without context). */
@Injectable()
export class TenancyLookupService {
  constructor(@Inject(PG_ADMIN_POOL) private readonly adminPool: Pool) {}

  async activeTenantBySlug(slug: string): Promise<{ id: string; slug: string }> {
    const res = await this.adminPool.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM tenant WHERE slug = $1 AND status = 'active'`,
      [slug],
    );
    const row = res.rows[0];
    if (!row) throw new UnauthorizedError('unknown tenant');
    return row;
  }

  async tenantSlugById(id: string): Promise<string | null> {
    const res = await this.adminPool.query<{ slug: string }>(
      'SELECT slug FROM tenant WHERE id = $1',
      [id],
    );
    return res.rows[0]?.slug ?? null;
  }
}

@Injectable()
export class AuthService {
  constructor(private readonly uow: UnitOfWork, private readonly tenancy: TenancyLookupService) {}

  async login(dto: LoginRequest): Promise<TokenPair> {
    const tenant = await this.tenancy.activeTenantBySlug(dto.tenantSlug);
    const user = await this.uow.run({ tenantId: tenant.id }, async (ctx) => {
      const res = await ctx.query<UserRow & Record<string, unknown>>(
        `SELECT id, tenant_id, email, password_hash, display_name, roles, status
         FROM app_user WHERE email = $1 AND status = 'active'`,
        [dto.email.toLowerCase()],
      );
      const u = res.rows[0];
      if (!u) throw new UnauthorizedError('invalid credentials');
      const ok = await verifyPassword(u.password_hash, dto.password);
      if (!ok) throw new UnauthorizedError('invalid credentials');
      return u;
    });

    const roles = user.roles.filter(isRole);
    await this.uow.run({ tenantId: tenant.id, userId: user.id }, async (ctx) => {
      await ctx.audit.record({
        tenantId: tenant.id,
        actorUserId: user.id,
        actorDisplay: user.display_name,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        details: { deviceCode: dto.deviceCode ?? null },
      });
      if (dto.deviceCode) {
        await ctx.query(
          `INSERT INTO device (tenant_id, user_id, device_code, platform, last_seen_at)
           VALUES ($1,$2,$3,$4, now())
           ON CONFLICT (tenant_id, device_code)
           DO UPDATE SET last_seen_at = now(), user_id = EXCLUDED.user_id`,
          [tenant.id, user.id, dto.deviceCode, dto.platform ?? 'unknown'],
        );
      }
    });

    return this.issuePair(user, tenant.id, tenant.slug, dto.deviceCode);
  }

  async refresh(dto: RefreshRequest): Promise<TokenPair> {
    let payload;
    try {
      payload = verifyRefreshToken(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    const slug = await this.tenancy.tenantSlugById(payload.tenant);
    if (!slug) throw new UnauthorizedException('tenant gone');
    const tenant = { id: payload.tenant, slug };
    const user = await this.uow.run({ tenantId: tenant.id }, async (ctx) => {
      const res = await ctx.query<UserRow & Record<string, unknown>>(
        `SELECT id, tenant_id, email, password_hash, display_name, roles, status
         FROM app_user WHERE id = $1 AND status = 'active'`,
        [payload.sub],
      );
      const u = res.rows[0];
      if (!u) throw new UnauthorizedError('user no longer active');
      return u;
    });
    await this.uow.run({ tenantId: tenant.id, userId: user.id }, async (ctx) => {
      await ctx.audit.record({
        tenantId: tenant.id,
        actorUserId: user.id,
        actorDisplay: user.display_name,
        action: 'auth.refresh',
        entityType: 'user',
        entityId: user.id,
        details: {},
      });
    });
    return this.issuePair(user, tenant.id, tenant.slug, payload.device);
  }

  async registerDevice(
    principal: { userId: string; tenantId: string; displayName: string },
    dto: DeviceRegisterRequest,
  ): Promise<{ id: string }> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const res = await ctx.query<{ id: string }>(
        `INSERT INTO device (tenant_id, user_id, device_code, platform, last_seen_at)
         VALUES ($1,$2,$3,$4, now())
         ON CONFLICT (tenant_id, device_code)
         DO UPDATE SET platform = EXCLUDED.platform, last_seen_at = now(), status = 'active'
         RETURNING id`,
        [principal.tenantId, principal.userId, dto.deviceCode, dto.platform],
      );
      const id = res.rows[0]!.id;
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'auth.device.registered',
        entityType: 'device',
        entityId: id,
        details: { deviceCode: dto.deviceCode, platform: dto.platform },
      });
      return { id };
    });
  }

  private issuePair(
    user: UserRow,
    tenantId: string,
    tenantSlug: string,
    deviceCode?: string,
  ): TokenPair {
    const roles = user.roles.filter(isRole);
    return {
      accessToken: signAccessToken({
        sub: user.id,
        tenant: tenantId,
        roles,
        displayName: user.display_name,
      }),
      refreshToken: signRefreshToken({ sub: user.id, tenant: tenantId, device: deviceCode }),
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        roles,
        tenantId,
        tenantSlug,
      },
    };
  }
}
