'use client';

import { PartyCrud } from '../../../components/party-crud';

/** Suppliers: list + create + inline edit against /api/suppliers. */
export default function SuppliersPage() {
  return <PartyCrud title="Suppliers" endpoint="/suppliers" emptyText="No suppliers yet — create the first one above." />;
}
