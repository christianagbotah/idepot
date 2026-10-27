/** Audit event value object — always emitted inside the posting transaction. */

export type AuditAction =
  | 'auth.login'
  | 'auth.refresh'
  | 'auth.device.registered'
  | 'warehouse.created'
  | 'warehouse.updated'
  | 'document.posted'
  | 'change_feed.acked';

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
