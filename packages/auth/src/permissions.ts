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
  // Phase 2 — master data & inventory
  'catalog:read',
  'catalog:write',
  'party:read',
  'party:write',
  'pricing:read',
  'pricing:write',
  'inventory:read',
  'inventory:write',
  'stockcount:read',
  'stockcount:count',
  'stockcount:approve',
  // Phase 3 — sales & POS
  'sales:read',
  'sales:write',      // create orders/quotations, price override visibility
  'sales:pos',        // commit POS/counter sales (cashier core action)
  'payment:read',
  'payment:write',    // receive payments, deposits, apply credit
  'shift:read',
  'shift:write',      // open/close own shift, cash movements
  'shift:approve',    // supervisor: review variance closes
  'sequence:manage',  // sequence/booklet management + spoilage
  'sync:device',      // offline device push/pull
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['owner', 'admin', 'manager', 'cashier', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

const MANAGER_PERMISSIONS: readonly Permission[] = [
  'warehouse:read',
  'warehouse:write',
  'audit:read',
  'sample:post',
  'catalog:read',
  'catalog:write',
  'party:read',
  'party:write',
  'pricing:read',
  'pricing:write',
  'inventory:read',
  'inventory:write',
  'stockcount:read',
  'stockcount:count',
  'stockcount:approve',
  // Phase 3 — sales & POS
  'sales:read',
  'sales:write',
  'sales:pos',
  'payment:read',
  'payment:write',
  'shift:read',
  'shift:write',
  'shift:approve',
  'sequence:manage',
  'sync:device',
];

const CASHIER_PERMISSIONS: readonly Permission[] = [
  'warehouse:read',
  'device:register',
  'catalog:read',
  'party:read',
  'pricing:read',
  'inventory:read',
  'stockcount:read',
  'stockcount:count',
  // Phase 3 — the POS core: sell, accept money, run a shift, sync offline
  'sales:read',
  'sales:pos',
  'payment:read',
  'payment:write',
  'shift:read',
  'shift:write',
  'sync:device',
];

const AUDITOR_PERMISSIONS: readonly Permission[] = [
  'warehouse:read',
  'audit:read',
  'outbox:read',
  'catalog:read',
  'party:read',
  'pricing:read',
  'inventory:read',
  'stockcount:read',
  'sales:read',
  'payment:read',
  'shift:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'tenant:manage'),
  manager: MANAGER_PERMISSIONS,
  cashier: CASHIER_PERMISSIONS,
  auditor: AUDITOR_PERMISSIONS,
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
