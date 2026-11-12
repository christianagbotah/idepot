'use client';

/**
 * Global search results (Phase 6 parity — closes the legacy
 * `search_result.php` gap: one box, every entity, permission-filtered
 * server-side). The API returns display evidence + a deep-link href per hit;
 * this page only renders it.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import type { SearchResultsDto } from '../../../lib/types';

const ENTITY_LABELS: Record<string, string> = {
  product: 'Products',
  customer: 'Customers',
  supplier: 'Suppliers',
  invoice: 'Invoices',
  quotation: 'Quotations',
  sales_order: 'Sales orders',
  waybill: 'Waybills',
  credit_note: 'Credit notes',
  purchase_order: 'Purchase orders',
  goods_receipt: 'Goods receipts',
  price_list: 'Price lists',
};

function SearchResults() {
  const session = useSession();
  const params = useSearchParams();
  const q = (params.get('q') ?? '').trim();

  const [results, setResults] = useState<SearchResultsDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (term: string, token: string) => {
    setBusy(true);
    setError('');
    setResults(null);
    try {
      setResults(await apiFetch<SearchResultsDto>(`/search?q=${encodeURIComponent(term)}`, { token }));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!session || q.length < 2) return;
    void run(q, session.accessToken);
  }, [session, q, run]);

  if (!session) return <p className="muted">Sign in first.</p>;
  if (q.length < 2) {
    return (
      <div>
        <div className="page-head"><h1>Search</h1></div>
        <p className="muted">Type at least 2 characters in the search box above.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head"><h1>Search results for “{q}”</h1></div>
      {error && <p className="error">{error}</p>}
      {busy && <p className="muted">Searching…</p>}
      {results && results.total === 0 && !busy && (
        <p className="muted">No matches. Search covers products, customers, suppliers and document codes (invoices, quotations, orders, waybills, credit notes, purchase orders, goods receipts, price lists) — limited by your permissions.</p>
      )}
      {results?.groups.map((group) => (
        <section key={group.entity} className="card">
          <h2>{ENTITY_LABELS[group.entity] ?? group.entity}</h2>
          <table className="table">
            <thead>
              <tr><th>Code</th><th>Title</th><th>Detail</th><th>Status</th><th>When</th><th /></tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.code ?? '—'}</td>
                  <td>{item.title}</td>
                  <td className="muted">{item.subtitle ?? '—'}</td>
                  <td><span className="badge">{item.status ?? '—'}</span></td>
                  <td className="muted">{item.when ? item.when.slice(0, 10) : '—'}</td>
                  <td><Link className="btn btn-sm" href={item.href}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="muted">Searching…</p>}>
      <SearchResults />
    </Suspense>
  );
}
