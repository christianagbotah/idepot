/**
 * RBAC permission catalog + role mapping + pure decision function.
 * Tested by the authorization matrix; roles are stored on app_user.roles.
 */

export const PERMISSIONS = [
  'warehouse:read',
  'warehouse:write',
  'audit:read',
  'outbox:read',
  'outbox:ack',
  'device:register',
  'sample:post',
  'tenant:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['owner', 'admin', 'manager', 'cashier', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'tenant:manage'),
  manager: ['warehouse:read', 'warehouse:write', 'audit:read', 'sample:post'],
  cashier: ['warehouse:read', 'device:register'],
  auditor: ['warehouse:read', 'audit:read', 'outbox:read'],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Pure RBAC decision — the only authorization code path used by guards. */
export function hasPermission(roles: string[], required: Permission | Permission[]): boolean {
  const req = Array.isArray(required) ? required : [required];
  const granted = new Set<Permission>();
  for (const r of roles) {
    if (isRole(r)) for (const p of ROLE_PERMISSIONS[r]) granted.add(p);
  }
  return req.every((p) => granted.has(p));
}
