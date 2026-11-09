/**
 * Tenant user/staff administration (Phase 5 §16 — legacy admin_list.php,
 * modal_admin_add.php, modal_admin_edit.php, manage_profile.php).
 *
 * Rules:
 *  - only owner/admin hold `users:manage` (guard-level; no other role lists it);
 *  - passwords are Argon2id hashes, never returned or logged;
 *  - every mutation writes an audit event with before/after evidence;
 *  - self-lockout is impossible: an actor can never change their own roles
 *    or status (display name is fine);
 *  - tenant-lockout is impossible: the LAST active owner/admin can never be
 *    disabled or stripped of both owner+admin roles;
 *  - a disabled user cannot log in and existing refresh tokens stop working
 *    (both auth paths filter on status = 'active').
 */
import { Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from '@idepot/auth';
import type { CreateUser, UpdateUser, UserDto } from '@idepot/contracts';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';

type Principal = { userId: string; tenantId: string; displayName: string };

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
  status: string;
  created_at: Date;
}

const ADMIN_CLASS_ROLES = ['owner', 'admin'];

function toDto(r: UserRow): UserDto {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    roles: r.roles,
    status: r.status,
    createdAt: r.created_at.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly uow: UnitOfWork) {}

  async listUsers(
    tenantId: string,
    filter: { status?: string; limit?: number; offset?: number },
  ): Promise<UserDto[]> {
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query<UserRow & Record<string, unknown>>(
        `SELECT id, email, display_name, roles, status, created_at
           FROM app_user
          WHERE ($1::text IS NULL OR status = $1)
          ORDER BY created_at, email
          LIMIT $2 OFFSET $3`,
        [filter.status ?? null, limit, offset],
      );
      return rows.rows.map(toDto);
    });
  }

  async createUser(principal: Principal, dto: CreateUser): Promise<UserDto> {
    const email = dto.email.toLowerCase();
    if (dto.roles.includes('owner')) {
      throw new ForbiddenError(
        'the owner role is reserved for the tenant bootstrap account — grant admin instead',
      );
    }
    const passwordHash = await hashPassword(dto.password);
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      let created: UserRow;
      try {
        const res = await ctx.query<UserRow & Record<string, unknown>>(
          `INSERT INTO app_user (tenant_id, email, password_hash, display_name, roles)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, display_name, roles, status, created_at`,
          [ctx.tenantId, email, passwordHash, dto.displayName, dto.roles],
        );
        created = res.rows[0]!;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === '23505') {
          throw new ConflictError(`a user with email '${email}' already exists in this tenant`);
        }
        throw err;
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'user.created',
        entityType: 'user',
        entityId: created.id,
        details: { email, displayName: created.display_name, roles: created.roles },
      });
      return toDto(created);
    });
  }

  async updateUser(principal: Principal, userId: string, dto: UpdateUser): Promise<UserDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const current = await this.loadUser(ctx, userId);
      this.assertNotSelf(principal, userId, 'roles or status');

      const losingAdminClass =
        dto.status === 'disabled' ||
        (dto.roles !== undefined && !dto.roles.some((r) => ADMIN_CLASS_ROLES.includes(r)));
      const isCurrentlyAdminClass = current.roles.some((r) => ADMIN_CLASS_ROLES.includes(r));
      if (losingAdminClass && isCurrentlyAdminClass && current.status === 'active') {
        await this.assertNotLastActiveAdmin(ctx, userId);
      }
      if (dto.status === 'disabled' && current.status === 'active') {
        await this.assertNotLastActiveAdmin(ctx, userId);
      }

      const displayName = dto.displayName ?? current.display_name;
      const roles = dto.roles ?? current.roles;
      const status = dto.status ?? current.status;
      if (roles.includes('owner') && !current.roles.includes('owner')) {
        throw new ForbiddenError('the owner role cannot be granted to another user');
      }

      const res = await ctx.query<UserRow & Record<string, unknown>>(
        `UPDATE app_user SET display_name = $3, roles = $4, status = $5
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, email, display_name, roles, status, created_at`,
        [ctx.tenantId, userId, displayName, roles, status],
      );
      const updated = res.rows[0]!;
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'user.updated',
        entityType: 'user',
        entityId: userId,
        details: {
          email: current.email,
          changes: {
            ...(dto.displayName !== undefined && dto.displayName !== current.display_name
              ? { displayName: { from: current.display_name, to: dto.displayName } }
              : {}),
            ...(dto.roles !== undefined && JSON.stringify(dto.roles) !== JSON.stringify(current.roles)
              ? { roles: { from: current.roles, to: dto.roles } }
              : {}),
            ...(dto.status !== undefined && dto.status !== current.status
              ? { status: { from: current.status, to: dto.status } }
              : {}),
          },
        },
      });
      return toDto(updated);
    });
  }

  async resetUserPassword(principal: Principal, userId: string, newPassword: string): Promise<{ id: string }> {
    const passwordHash = await hashPassword(newPassword);
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const current = await this.loadUser(ctx, userId);
      this.assertNotSelf(principal, userId, 'the password (use profile → change password)');
      await ctx.query(`UPDATE app_user SET password_hash = $3 WHERE tenant_id = $1 AND id = $2`, [
        ctx.tenantId,
        userId,
        passwordHash,
      ]);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'user.password_reset',
        entityType: 'user',
        entityId: userId,
        details: { email: current.email },
      });
      return { id: userId };
    });
  }

  /** Own profile: change display name (password change lives in auth). */
  async updateOwnProfile(principal: Principal, displayName: string): Promise<UserDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const res = await ctx.query<UserRow & Record<string, unknown>>(
        `UPDATE app_user SET display_name = $3 WHERE tenant_id = $1 AND id = $2
         RETURNING id, email, display_name, roles, status, created_at`,
        [ctx.tenantId, principal.userId, displayName],
      );
      const updated = res.rows[0]!;
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'user.profile_updated',
        entityType: 'user',
        entityId: principal.userId,
        details: { displayName },
      });
      return toDto(updated);
    });
  }

  /** Own profile: change password after verifying the current one. */
  async changeOwnPassword(
    principal: Principal,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ id: string }> {
    const passwordHash = await hashPassword(newPassword);
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const res = await ctx.query<{ id: string; password_hash: string; email: string }>(
        `SELECT id, password_hash, email FROM app_user WHERE tenant_id = $1 AND id = $2`,
        [ctx.tenantId, principal.userId],
      );
      const user = res.rows[0];
      if (!user) throw new NotFoundError('user', principal.userId);
      const ok = await verifyPassword(user.password_hash, currentPassword);
      if (!ok) throw new ValidationError('current password is incorrect');
      await ctx.query(`UPDATE app_user SET password_hash = $3 WHERE tenant_id = $1 AND id = $2`, [
        ctx.tenantId,
        principal.userId,
        passwordHash,
      ]);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'user.password_changed',
        entityType: 'user',
        entityId: principal.userId,
        details: { email: user.email },
      });
      return { id: principal.userId };
    });
  }

  // -------------------------------------------------------------------------

  private async loadUser(ctx: UowContext, userId: string): Promise<UserRow> {
    const res = await ctx.query<UserRow & Record<string, unknown>>(
      `SELECT id, email, display_name, roles, status, created_at
         FROM app_user WHERE tenant_id = $1 AND id = $2`,
      [ctx.tenantId, userId],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('user', userId);
    return row;
  }

  private assertNotSelf(principal: Principal, userId: string, what: string): void {
    if (principal.userId === userId) {
      throw new ForbiddenError(`you cannot change your own ${what} — self-lockout guard`);
    }
  }

  /** Refuse when the target is the LAST active owner/admin of the tenant. */
  private async assertNotLastActiveAdmin(ctx: UowContext, excludeUserId: string): Promise<void> {
    const res = await ctx.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM app_user
        WHERE tenant_id = $1 AND status = 'active' AND id <> $2
          AND (roles && ARRAY['owner','admin']::text[])`,
      [ctx.tenantId, excludeUserId],
    );
    const others = Number(res.rows[0]!.count);
    if (others === 0) {
      throw new ConflictError(
        'cannot disable or demote the last active owner/admin of the tenant — promote another admin first',
      );
    }
  }
}
