'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, useSession } from '../../lib/session';

interface NavLink {
  href: string;
  label: string;
}

const NAV: Array<{ group: string; links: NavLink[] }> = [
  {
    group: 'Catalog',
    links: [
      { href: '/catalog', label: 'Products' },
      { href: '/categories', label: 'Categories' },
      { href: '/units', label: 'Units' },
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
      { href: '/sales-orders', label: 'Orders' },
      { href: '/payments', label: 'Payments' },
      { href: '/deposits', label: 'Deposits' },
      { href: '/shifts', label: 'Shifts' },
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
            {NAV.flatMap((group) => [
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
