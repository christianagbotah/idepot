/** Warehouse aggregate (Phase 1 sample tenant-scoped resource). */
import { ValidationError } from './errors.js';

export const WAREHOUSE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

export interface WarehouseProps {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
}

export interface NewWarehouse {
  code: string;
  name: string;
  isActive?: boolean;
}

export function validateNewWarehouse(input: NewWarehouse): void {
  if (!WAREHOUSE_CODE_PATTERN.test(input.code)) {
    throw new ValidationError(
      `warehouse code must match ${WAREHOUSE_CODE_PATTERN.source} (got "${input.code}")`,
    );
  }
  if (input.name.trim().length < 2 || input.name.length > 200) {
    throw new ValidationError('warehouse name must be 2..200 characters');
  }
}

export function warehouseCodeOf(row: {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: Date;
}): WarehouseProps {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
