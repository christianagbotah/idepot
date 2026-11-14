/**
 * Device fleet administration (Phase 6 B-device management + migration
 * workstream): pairing codes, hardware profiles, revocation/reactivation,
 * and license seats. All routes audited; RBAC: devices:read for listing,
 * devices:manage for every mutation (owner/admin).
 *
 * Pairing model (docs/architecture/pos-hardware.md §3 + PHASE6 handoff):
 *  1. an administrator issues a single-use, 15-minute pairing code
 *     (POST /api/devices/pairing-codes) — optionally carrying a branch and
 *     hardware profile the new terminal should adopt;
 *  2. the new terminal's app (signed in by any user with sync:device)
 *     registers its device identity (POST /api/auth/devices) and then
 *     completes pairing (POST /api/devices/pair) with the code;
 *  3. revoking a device (POST /api/devices/:id/revoke) immediately blocks
 *     its sync pushes (sync.service device guard) — the legacy-credential
 *     rotation / re-pairing path for migrated depots.
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { parseBody } from '../parse-body.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';

type Principal = { userId: string; tenantId: string; displayName: string; roles: string[] };

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

const HardwareConfigSchema = z.object({
  receiptPrinter: z.object({ deviceId: z.string().min(1), profile: z.enum(['escpos-58mm', 'escpos-80mm']) }).nullish(),
  labelPrinter: z.object({ deviceId: z.string().min(1) }).nullish(),
  drawer: z.object({ deviceId: z.string().min(1) }).nullish(),
  scanner: z.object({ deviceId: z.string().min(1) }).nullish(),
});

const IssuePairingCodeSchema = z.object({
  branchId: z.string().uuid().nullish(),
  hardwareConfig: HardwareConfigSchema.default({}),
  validMinutes: z.number().int().min(5).max(60).default(15),
});

const PairDeviceSchema = z.object({
  pairingCode: z.string().min(6).max(16),
  deviceCode: z.string().min(3).max(60),
  platform: z.string().min(2).max(40),
  name: z.string().min(1).max(80).nullish(),
  appVersion: z.string().max(40).nullish(),
});

const UpdateDeviceSchema = z.object({
  name: z.string().min(1).max(80).nullish(),
  branchId: z.string().uuid().nullish(),
  hardwareConfig: HardwareConfigSchema.optional(),
});

const LicenseSchema = z.object({
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().max(300).nullish(),
});

const randomPairingCode = (): string => {
  // unambiguous alphabet (no 0/O/1/I) — read over the phone / typed by hand
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('devices')
export class DevicesAdminController {
  constructor(private readonly uow: UnitOfWork) {}

  /** Fleet overview: devices with pairing, sync and license evidence. */
  @Get()
  @RequirePermissions('devices:read')
  async list(@Req() req: Request) {
    const p = principalOf(req);
    return this.uow.run({ tenantId: p.tenantId }, async (ctx) => {
      const devices = await ctx.query<Record<string, unknown>>(
        `SELECT d.id, d.device_code, d.name, d.platform, d.status, d.app_version,
                d.last_sync_cursor, d.last_seen_at, d.paired_at, d.hardware_config,
                b.name AS branch_name,
                l.status AS license_status, l.valid_until AS license_valid_until
         FROM device d
         LEFT JOIN branch b ON b.id = d.branch_id AND b.tenant_id = d.tenant_id
         LEFT JOIN device_license l ON l.device_id = d.id AND l.tenant_id = d.tenant_id
         WHERE d.tenant_id = $1
         ORDER BY d.device_code`,
        [p.tenantId],
      );
      return devices.rows;
    });
  }

  /** Issue a single-use, short-lived pairing code (optionally with the
   *  branch + hardware profile the paired terminal adopts). */
  @Post('pairing-codes')
  @RequirePermissions('devices:manage')
  async issuePairingCode(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    const dto = parseBody(IssuePairingCodeSchema, body);
    return this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
      const code = randomPairingCode();
      const expires = new Date(Date.now() + dto.validMinutes * 60_000);
      const res = await ctx.query<{ id: string; expires_at: Date }>(
        `INSERT INTO device_pairing_code (tenant_id, code, branch_id, hardware_config, created_by, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, expires_at`,
        [p.tenantId, code, dto.branchId ?? null, JSON.stringify(dto.hardwareConfig), p.userId, expires],
      );
      await ctx.audit.record({
        tenantId: p.tenantId,
        actorUserId: p.userId,
        actorDisplay: p.displayName,
        action: 'device.pairing_code_issued',
        entityType: 'device_pairing_code',
        entityId: res.rows[0]!.id,
        details: { validMinutes: dto.validMinutes, branchId: dto.branchId ?? null },
      });
      return { code, expiresAt: res.rows[0]!.expires_at };
    });
  }

  /** Complete pairing from the DEVICE side: consumes the code, binds the
   *  branch/hardware profile, records pairing evidence. Requires an
   *  authenticated user with sync:device (the device's signed-in operator). */
  @Post('pair')
  @RequirePermissions('sync:device')
  async pair(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    const dto = parseBody(PairDeviceSchema, body);
    return this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
      const code = await ctx.query<Record<string, unknown>>(
        `SELECT id, branch_id, hardware_config, expires_at, consumed_at, revoked_at
         FROM device_pairing_code
         WHERE tenant_id = $1 AND code = $2
         FOR UPDATE`,
        [p.tenantId, dto.pairingCode],
      );
      const row = code.rows[0];
      if (!row) throw new BadRequestException('unknown pairing code');
      if (row.consumed_at) throw new BadRequestException('pairing code already used');
      if (row.revoked_at) throw new BadRequestException('pairing code revoked');
      if (new Date(row.expires_at as string) < new Date()) {
        throw new BadRequestException('pairing code expired');
      }
      const device = await ctx.query<{ id: string }>(
        `INSERT INTO device (tenant_id, user_id, device_code, platform, status, last_seen_at,
                             name, branch_id, hardware_config, app_version, paired_at, paired_by)
         VALUES ($1,$2,$3,$4,'active',now(),$5,$6,$7,$8,now(),$9)
         ON CONFLICT (tenant_id, device_code)
         DO UPDATE SET platform = EXCLUDED.platform, status = 'active', last_seen_at = now(),
                       name = COALESCE(EXCLUDED.name, device.name),
                       branch_id = COALESCE(EXCLUDED.branch_id, device.branch_id),
                       hardware_config = EXCLUDED.hardware_config,
                       app_version = EXCLUDED.app_version,
                       paired_at = now(), paired_by = EXCLUDED.paired_by
         RETURNING id`,
        [
          p.tenantId,
          p.userId,
          dto.deviceCode,
          dto.platform,
          dto.name ?? null,
          row.branch_id,
          JSON.stringify(row.hardware_config ?? {}),
          dto.appVersion ?? null,
          p.userId,
        ],
      );
      const deviceId = device.rows[0]!.id;
      await ctx.query(`UPDATE device_pairing_code SET consumed_at = now(), consumed_device_id = $1 WHERE id = $2`, [
        deviceId,
        row.id,
      ]);
      await ctx.audit.record({
        tenantId: p.tenantId,
        actorUserId: p.userId,
        actorDisplay: p.displayName,
        action: 'device.paired',
        entityType: 'device',
        entityId: deviceId,
        details: { deviceCode: dto.deviceCode, platform: dto.platform, appVersion: dto.appVersion ?? null },
      });
      return { deviceId };
    });
  }

  /** Rename / rebind branch / update the terminal hardware profile. */
  @Patch(':id')
  @RequirePermissions('devices:manage')
  async update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = principalOf(req);
    const dto = parseBody(UpdateDeviceSchema, body);
    return this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
      const res = await ctx.query(
        `UPDATE device SET
           name = COALESCE($3, name),
           branch_id = COALESCE($4, branch_id),
           hardware_config = COALESCE($5::jsonb, hardware_config)
         WHERE id = $2 AND tenant_id = $1
         RETURNING id, name, hardware_config`,
        [p.tenantId, id, dto.name ?? null, dto.branchId ?? null, dto.hardwareConfig ? JSON.stringify(dto.hardwareConfig) : null],
      );
      if (res.rows.length === 0) throw new BadRequestException('unknown device');
      await ctx.audit.record({
        tenantId: p.tenantId,
        actorUserId: p.userId,
        actorDisplay: p.displayName,
        action: 'device.updated',
        entityType: 'device',
        entityId: id,
        details: { name: dto.name ?? null, branchId: dto.branchId ?? null, hardwareConfig: !!dto.hardwareConfig },
      });
      return res.rows[0];
    });
  }

  /** Revoke: the device immediately loses sync access (server-side guard). */
  @Post(':id/revoke')
  @RequirePermissions('devices:manage')
  async revoke(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.setStatus(req, id, 'revoked', 'device.revoked');
  }

  @Post(':id/reactivate')
  @RequirePermissions('devices:manage')
  async reactivate(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.setStatus(req, id, 'active', 'device.reactivated');
  }

  private async setStatus(req: Request, id: string, status: 'active' | 'revoked', action: string) {
    const p = principalOf(req);
    return this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
      const res = await ctx.query(
        `UPDATE device SET status = $3 WHERE id = $2 AND tenant_id = $1 RETURNING id, device_code, status`,
        [p.tenantId, id, status],
      );
      if (res.rows.length === 0) throw new BadRequestException('unknown device');
      await ctx.audit.record({
        tenantId: p.tenantId,
        actorUserId: p.userId,
        actorDisplay: p.displayName,
        action,
        entityType: 'device',
        entityId: id,
        details: { deviceCode: res.rows[0]!.device_code },
      });
      return res.rows[0];
    });
  }

  /** Issue or update the device's license seat (administration-controlled;
   *  nothing auto-suspends — product requirements decide enforcement). */
  @Post(':id/license')
  @RequirePermissions('devices:manage')
  async license(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = principalOf(req);
    const dto = parseBody(LicenseSchema, body);
    return this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
      const device = await ctx.query(`SELECT id FROM device WHERE id = $2 AND tenant_id = $1`, [p.tenantId, id]);
      if (device.rows.length === 0) throw new BadRequestException('unknown device');
      const res = await ctx.query(
        `INSERT INTO device_license (tenant_id, device_id, status, valid_until, note, issued_by)
         VALUES ($1,$2,'active',$3,$4,$5)
         ON CONFLICT (tenant_id, device_id)
         DO UPDATE SET status = 'active', valid_until = EXCLUDED.valid_until,
                       note = EXCLUDED.note, issued_by = EXCLUDED.issued_by, revoked_at = NULL
         RETURNING id, status, valid_until`,
        [p.tenantId, id, dto.validUntil ?? null, dto.note ?? null, p.userId],
      );
      await ctx.audit.record({
        tenantId: p.tenantId,
        actorUserId: p.userId,
        actorDisplay: p.displayName,
        action: 'device.licensed',
        entityType: 'device_license',
        entityId: String(res.rows[0]!.id),
        details: { deviceId: id, validUntil: dto.validUntil ?? null },
      });
      return res.rows[0];
    });
  }

  @Post(':id/license/revoke')
  @RequirePermissions('devices:manage')
  async revokeLicense(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const p = principalOf(req);
    return this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
      const res = await ctx.query(
        `UPDATE device_license SET status = 'revoked', revoked_at = now()
         WHERE device_id = $2 AND tenant_id = $1 RETURNING id`,
        [p.tenantId, id],
      );
      if (res.rows.length === 0) throw new ForbiddenException('device has no license seat');
      await ctx.audit.record({
        tenantId: p.tenantId,
        actorUserId: p.userId,
        actorDisplay: p.displayName,
        action: 'device.license_revoked',
        entityType: 'device_license',
        entityId: String(res.rows[0]!.id),
        details: { deviceId: id },
      });
      return { revoked: true };
    });
  }
}
