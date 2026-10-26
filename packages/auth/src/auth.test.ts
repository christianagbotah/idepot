import { describe, it, expect, beforeAll } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';
import { hasPermission, ROLE_PERMISSIONS } from './permissions.js';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './tokens.js';

beforeAll(() => {
  process.env.IDEPOT_JWT_SECRET ??= 'unit-test-secret-0123456789abcdef';
});

describe('Argon2id password hashing', () => {
  it('hashes and verifies; rejects wrong password', async () => {
    const h = await hashPassword('Correct-Horse-1');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'Correct-Horse-1')).toBe(true);
    expect(await verifyPassword(h, 'wrong-password')).toBe(false);
  });
});

describe('RBAC decision function', () => {
  it('maps roles to permission sets', () => {
    expect(hasPermission(['owner'], 'tenant:manage')).toBe(true);
    expect(hasPermission(['admin'], 'tenant:manage')).toBe(false);
    expect(hasPermission(['admin'], 'warehouse:write')).toBe(true);
    expect(hasPermission(['cashier'], 'warehouse:write')).toBe(false);
    expect(hasPermission(['cashier'], ['warehouse:read', 'device:register'])).toBe(true);
    expect(hasPermission(['auditor'], 'audit:read')).toBe(true);
    expect(hasPermission(['auditor'], 'warehouse:write')).toBe(false);
    expect(ROLE_PERMISSIONS.cashier).not.toContain('warehouse:write');
  });

  it('fails closed for unknown roles', () => {
    expect(hasPermission(['superuser'], 'warehouse:read')).toBe(false);
    expect(hasPermission([], 'warehouse:read')).toBe(false);
  });
});

describe('JWT tokens', () => {
  it('round-trips access and refresh tokens with type separation', () => {
    const access = signAccessToken({
      sub: 'u-1',
      tenant: 't-1',
      roles: ['owner'],
      displayName: 'Owner One',
    });
    const p = verifyAccessToken(access);
    expect(p.sub).toBe('u-1');
    expect(p.tenant).toBe('t-1');
    expect(p.typ).toBe('access');

    const refresh = signRefreshToken({ sub: 'u-1', tenant: 't-1', device: 'dev-1' });
    const rp = verifyRefreshToken(refresh);
    expect(rp.typ).toBe('refresh');
    expect(rp.device).toBe('dev-1');
    expect(() => verifyAccessToken(refresh)).toThrow();
    expect(() => verifyRefreshToken(access)).toThrow();
  });
});
