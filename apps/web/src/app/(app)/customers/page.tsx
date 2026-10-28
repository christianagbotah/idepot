'use client';

import { PartyCrud } from '../../../components/party-crud';

/** Customers: list + create + inline edit against /api/customers. */
export default function CustomersPage() {
  return <PartyCrud title="Customers" endpoint="/customers" emptyText="No customers yet — create the first one above." />;
}
