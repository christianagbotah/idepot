/** Audit event value object — always emitted inside the posting transaction. */

export type AuditAction =
  | 'auth.login'
  | 'auth.refresh'
  | 'auth.device.registered'
  | 'warehouse.created'
  | 'warehouse.updated'
  | 'document.posted'
  | 'change_feed.acked'
  | 'product.created'
  | 'product.updated'
  | 'category.created'
  | 'category.updated'
  | 'unit.created'
  | 'product_unit.created'
  | 'product_barcode.created'
  | 'customer.created'
  | 'customer.updated'
  | 'supplier.created'
  | 'supplier.updated'
  | 'price_list.created'
  | 'price_list_item.created'
  | 'price_list_item.closed'
  | 'stock.moved'
  | 'stock.count.created'
  | 'stock.count.approved'
  | 'stock.adjustment.posted'
  | 'transfer.dispatched'
  | 'transfer.received'
  | 'transfer.created'
  | 'party_opening_balance.posted';

export interface AuditEventProps {
  tenantId: string;
  actorUserId: string | null;
  actorDisplay: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
}

export function auditEvent(props: AuditEventProps): AuditEventProps {
  if (!props.action.includes('.')) {
    throw new Error(`audit action must be namespaced ("entity.verb"), got "${props.action}"`);
  }
  return props;
}
