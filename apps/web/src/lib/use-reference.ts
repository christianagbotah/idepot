'use client';

import { useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from './api';
import type { ListDto, ProductDto, Session, WarehouseDto } from './types';

export interface ReferenceData {
  warehouses: WarehouseDto[];
  products: ProductDto[];
  refError: string;
}

/**
 * Loads the two reference lists most inventory pages need (warehouses +
 * products) once per mount, for pickers and client-side name resolution.
 */
export function useReferenceData(session: Session | null): ReferenceData {
  const [data, setData] = useState<ReferenceData>({ warehouses: [], products: [], refError: '' });

  useEffect(() => {
    if (!session) return;
    const token = session.accessToken;
    let cancelled = false;
    void Promise.all([
      apiFetch<ListDto<WarehouseDto>>('/warehouses', { token }),
      apiFetch<ListDto<ProductDto>>('/products', { token }),
    ]).then(
      ([w, p]) => {
        if (!cancelled) setData({ warehouses: w.items, products: p.items, refError: '' });
      },
      (err) => {
        if (!cancelled) setData({ warehouses: [], products: [], refError: apiErrorMessage(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session]);

  return data;
}

/** `CODE · Name` for a resolved id, or a short id fallback. */
export function labelOf(
  map: Map<string, { code: string; name: string }>,
  id: string,
): string {
  const v = map.get(id);
  return v ? `${v.code} · ${v.name}` : id.slice(0, 8);
}
