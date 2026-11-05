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
  'sales:price_override',    // Phase 3 hardening: charge a non-server price (evidence + thresholds)
  'sales:discount_override', // Phase 3 hardening: grant an order discount (evidence + thresholds)
  'sales:tax_exempt_override', // Review hardening: exempt a line ad hoc (audited evidence)
  'sales:reverse_invoice',   // Review hardening: post an invoice reversal correction document
  'payment:read',
  'payment:write',    // receive payments, deposits, apply credit
  'shift:read',
  'shift:write',      // open/close own shift, cash movements
  'shift:approve',    // supervisor: review variance closes
  'sequence:manage',  // sequence/booklet management + spoilage
  'sync:device',      // offline device push/pull
  // Phase 3 hardening — financial configuration & evidence
  'tax:manage',       // configure effective-dated tax profiles/versions/components
  'gl:read',          // chart of accounts, control mappings, journal evidence
  // Phase 4 — purchasing & accounting
  'purchasing:read',  // view POs, GRNs, supplier invoices, match review
  'purchasing:write', // create/edit draft POs, supplier invoices
  'purchasing:approve', // approve POs, match exceptions, tolerance overrides
  'receiving:read',   // view GRNs
  'receiving:write',  // post goods receipts
  'ap:read',          // view AP subledger, statements, aging
  'ap:write',         // record supplier adjustments (debit/credit notes)
  'ap:pay',           // post supplier payments + allocations
  'accounting:read',  // periods, reconciliation, close checklist
  'accounting:journal',   // approved manual journals + reversals
  'accounting:configure', // chart-of-accounts + purpose mapping administration
  'accounting:close',     // period close / soft-close / reopen
  'banking:read',     // view bank accounts, transfers, statements
  'banking:write',    // create bank accounts, transfers, import statements
  'banking:reconcile', // match/unmatch statement lines, finalize reconciliations
  'financial-report:read', // trial balance, P&L, balance sheet, cash flow
  // Phase 5 — returns, reporting, KPI, administration, loyalty
  'returns:read',     // view return orders, credit notes, refunds, store credits
  'returns:write',    // create/submit return orders (cashier core action)
  'returns:approve',  // approve returns + rejection/cancellation authority
  'returns:refund',   // request/approve/post refunds (money OUT — high risk)
  'reports:read',     // operational reports (sales, stock, backlog, margins)
  'kpi:manage',       // KPI snapshot rebuilds + target administration
  'settings:manage',  // tenant settings administration (versioned config)
  'loyalty:manage',   // optional loyalty foundation administration (inactive by default)
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['owner', 'admin', 'manager', 'cashier', 'auditor', 'accountant', 'procurement'] as const;
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
  'sales:price_override',
  'sales:discount_override',
  'sales:tax_exempt_override',
  'sales:reverse_invoice',
  'payment:read',
  'payment:write',
  'shift:read',
  'shift:write',
  'shift:approve',
  'sequence:manage',
  'sync:device',
  'tax:manage',
  'gl:read',
  // Phase 4 — full operational purchasing/accounting authority
  'purchasing:read',
  'purchasing:write',
  'purchasing:approve',
  'receiving:read',
  'receiving:write',
  'ap:read',
  'ap:write',
  'ap:pay',
  'accounting:read',
  'accounting:journal',
  'banking:read',
  'banking:write',
  'banking:reconcile',
  'financial-report:read',
  // Phase 5 — full returns/refunds authority + reporting/KPI/settings
  'returns:read',
  'returns:write',
  'returns:approve',
  'returns:refund',
  'reports:read',
  'kpi:manage',
  'settings:manage',
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
  // Phase 3 — the POS core: sell, accept money, run a shift, sync offline.
  // Deliberately WITHOUT price/discount/tax-exempt override powers or
  // invoice reversals: a cashier charges the server-resolved, server-taxed
  // price; overrides and corrections need a manager (Phase 3 hardening +
  // review hardening).
  'sales:read',
  'sales:pos',
  'payment:read',
  'payment:write',
  'shift:read',
  'shift:write',
  'sync:device',
  // Phase 5 — a cashier may CAPTURE a return for the customer, but
  // never approve one, never post a refund (money out) — those need a
  // manager/accountant with returns:approve / returns:refund.
  'returns:read',
  'returns:write',
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
  'gl:read',
  // Phase 4 — read-only across purchasing/accounting/banking
  'purchasing:read',
  'receiving:read',
  'ap:read',
  'accounting:read',
  'banking:read',
  'financial-report:read',
  // Phase 5 — read-only returns evidence + operational reports
  'returns:read',
  'reports:read',
];

/** Accountant (Phase 4): books, journals, banking, close — not POS. */
const ACCOUNTANT_PERMISSIONS: readonly Permission[] = [
  'audit:read',
  'catalog:read',
  'party:read',
  'pricing:read',
  'inventory:read',
  'stockcount:read',
  'sales:read',
  'payment:read',
  'shift:read',
  'gl:read',
  'tax:manage',
  // Phase 4
  'purchasing:read',
  'receiving:read',
  'ap:read',
  'ap:write',
  'ap:pay',
  'accounting:read',
  'accounting:journal',
  'accounting:configure',
  'accounting:close',
  'banking:read',
  'banking:write',
  'banking:reconcile',
  'financial-report:read',
  // Phase 5 — refunds are money-out accounting; accountants may approve
  // and post them, run reports and KPI administration
  'returns:read',
  'returns:approve',
  'returns:refund',
  'reports:read',
  'kpi:manage',
];

/** Procurement officer (Phase 4): POs, receipts, supplier records view. */
const PROCUREMENT_PERMISSIONS: readonly Permission[] = [
  'catalog:read',
  'party:read',
  'inventory:read',
  'warehouse:read',
  'purchasing:read',
  'purchasing:write',
  'purchasing:approve',
  'receiving:read',
  'receiving:write',
  'ap:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'tenant:manage'),
  manager: MANAGER_PERMISSIONS,
  cashier: CASHIER_PERMISSIONS,
  auditor: AUDITOR_PERMISSIONS,
  accountant: ACCOUNTANT_PERMISSIONS,
  procurement: PROCUREMENT_PERMISSIONS,
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
