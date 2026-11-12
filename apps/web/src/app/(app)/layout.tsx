'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, useSession } from '../../lib/session';

interface NavLink {
  href: string;
  label: string;
}

const NAV: Array<{ group: string; links: NavLink[]; roles?: string[] }> = [
  {
    group: 'Catalog',
    links: [
      { href: '/catalog', label: 'Products' },
      { href: '/categories', label: 'Categories' },
      { href: '/units', label: 'Units' },
      { href: '/price-lists', label: 'Price Lists' },
    ],
  },
  {
    group: 'Parties',
    links: [
      { href: '/customers', label: 'Customers' },
      { href: '/suppliers', label: 'Suppliers' },
    ],
  },
  {
    group: 'Warehouse',
    links: [
      { href: '/warehouses', label: 'Warehouses' },
      { href: '/inventory', label: 'Stock' },
      { href: '/inventory/movements', label: 'Movements' },
      { href: '/inventory/counts', label: 'Counts' },
      { href: '/inventory/adjustments', label: 'Adjustments' },
      { href: '/inventory/transfers', label: 'Transfers' },
    ],
  },
  {
    group: 'Sales & POS',
    links: [
      { href: '/pos', label: 'POS' },
      { href: '/sales', label: 'Invoices' },
      { href: '/quotations', label: 'Quotations' },
      { href: '/sales-orders', label: 'Orders' },
      { href: '/payments', label: 'Payments' },
      { href: '/deposits', label: 'Deposits' },
      { href: '/shifts', label: 'Shifts' },
    ],
  },
  {
    group: 'Returns & Refunds',
    links: [
      { href: '/returns', label: 'Returns' },
      { href: '/returns/new', label: 'New Return' },
      { href: '/returns/credit-notes', label: 'Credit Notes' },
      { href: '/returns/store-credits', label: 'Store Credits' },
    ],
  },
  {
    group: 'Insights',
    links: [
      { href: '/reports', label: 'Reports' },
      { href: '/kpi', label: 'KPI Dashboard' },
    ],
  },
  {
    group: 'Administration',
    roles: ['owner', 'admin', 'manager', 'accountant', 'auditor'],
    links: [
      { href: '/admin/audit', label: 'Audit Trail' },
      { href: '/admin/settings', label: 'Settings' },
    ],
  },
  {
    group: 'Administration · Users',
    // nav visibility only — the server enforces users:manage (owner/admin)
    roles: ['owner', 'admin'],
    links: [{ href: '/admin/users', label: 'Users & Roles' }],
  },
  {
    group: 'Account',
    links: [{ href: '/profile', label: 'My Profile' }],
  },
  {
    group: 'Purchasing',
    // nav visibility only — the server enforces the real permissions
    roles: ['owner', 'admin', 'manager', 'accountant', 'procurement', 'auditor'],
    links: [
      { href: '/purchasing/orders', label: 'Purchase Orders' },
      { href: '/purchasing/grns', label: 'Goods Receipts' },
      { href: '/purchasing/invoices', label: 'Supplier Invoices' },
      { href: '/purchasing/payments', label: 'Supplier Payments' },
      { href: '/purchasing/adjustments', label: 'Debit/Credit Notes' },
      { href: '/ap', label: 'AP Aging & Statements' },
    ],
  },
  {
    group: 'Accounting',
    roles: ['owner', 'admin', 'manager', 'accountant', 'auditor'],
    links: [
      { href: '/accounting/accounts', label: 'Chart of Accounts' },
      { href: '/accounting/journals', label: 'Journals' },
      { href: '/accounting/periods', label: 'Periods & Close' },
      { href: '/accounting/reports', label: 'Financial Reports' },
      { href: '/accounting/reconciliation', label: 'Reconciliation' },
    ],
  },
  {
    group: 'Banking',
    roles: ['owner', 'admin', 'manager', 'accountant', 'auditor'],
    links: [
      { href: '/banking/accounts', label: 'Bank Accounts' },
      { href: '/banking/transfers', label: 'Transfers' },
      { href: '/banking/statements', label: 'Statements & Match' },
    ],
  },
];

/**
 * Authenticated app shell: topbar (tenant/user + logout) and a sidebar that
 * collapses into a horizontal scrollable nav bar on mobile (CSS only).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (!session) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <p className="muted">Checking session…</p>
        </main>
      </div>
    );
  }

  function logout() {
    clearSession();
    router.replace('/');
  }

  const u = session.user;

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-brand">iDepot</div>
        {/* Global search (Phase 6 parity): plain GET form → /search; the API
            filters results by the signed-in user's permissions. */}
        <form className="toolbar" action="/search" method="get" role="search" style={{ flex: 1, maxWidth: 420, margin: '0 16px' }}>
          <input
            className="input"
            type="search"
            name="q"
            placeholder="Search products, customers, document codes…"
            aria-label="Global search"
            minLength={2}
            style={{ flex: 1 }}
          />
          <button className="btn" type="submit">Search</button>
        </form>
        <div className="toolbar">
          <div className="app-user">
            <div style={{ fontWeight: 600 }}>{u.displayName}</div>
            <div className="muted">
              {u.tenantSlug} · {u.roles.join(', ')}
            </div>
          </div>
          <button className="btn" type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <div className="app-body">
        <nav className="app-sidebar" aria-label="Main navigation">
          <div className="app-nav">
            {NAV.filter((group) => group.roles == null || group.roles.some((r) => u.roles.includes(r))).flatMap((group) => [
              <div key={group.group} className="nav-group">
                {group.group}
              </div>,
              ...group.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="nav-link"
                  data-active={pathname === l.href}
                >
                  {l.label}
                </Link>
              )),
            ])}
          </div>
        </nav>
        <main className="app-main">
          <div className="app-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
