'use client';

import { useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from './api';
import type { ListDto, ProductDto, Session, SupplierDto, WarehouseDto } from './types';

export interface ReferenceData {
  warehouses: WarehouseDto[];
  products: ProductDto[];
  suppliers: SupplierDto[];
  refError: string;
}

/**
 * Loads the reference lists inventory/purchasing pages need (warehouses +
 * products, and suppliers when asked) once per mount, for pickers and
 * client-side name resolution.
 */
export function useReferenceData(session: Session | null, opts: { suppliers?: boolean } = {}): ReferenceData {
  const [data, setData] = useState<ReferenceData>({ warehouses: [], products: [], suppliers: [], refError: '' });

  useEffect(() => {
    if (!session) return;
    const token = session.accessToken;
    let cancelled = false;
    const loads: Array<Promise<ListDto<WarehouseDto>> | Promise<ListDto<ProductDto>> | Promise<ListDto<SupplierDto>>> = [
      apiFetch<ListDto<WarehouseDto>>('/warehouses', { token }),
      apiFetch<ListDto<ProductDto>>('/products', { token }),
    ];
    if (opts.suppliers === true) {
      loads.push(apiFetch<ListDto<SupplierDto>>('/suppliers', { token }));
    }
    void Promise.all(loads).then(
      (results) => {
        if (cancelled) return;
        const [w, p, s] = results as [ListDto<WarehouseDto>, ListDto<ProductDto>, ListDto<SupplierDto> | undefined];
        setData({ warehouses: w.items, products: p.items, suppliers: s?.items ?? [], refError: '' });
      },
      (err) => {
        if (!cancelled) setData({ warehouses: [], products: [], suppliers: [], refError: apiErrorMessage(err) });
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
