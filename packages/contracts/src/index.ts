import { z } from 'zod';

/* ---------------------------------- auth ---------------------------------- */

export const LoginRequestSchema = z.object({
  tenantSlug: z.string().min(2).max(63),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  deviceCode: z.string().min(3).max(100).optional(),
  platform: z.string().min(1).max(50).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    tenantId: string;
    tenantSlug: string;
  };
}

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const DeviceRegisterRequestSchema = z.object({
  deviceCode: z.string().min(3).max(100),
  platform: z.string().min(1).max(50),
  name: z.string().max(120).optional(),
});
export type DeviceRegisterRequest = z.infer<typeof DeviceRegisterRequestSchema>;

/* -------------------------------- warehouse -------------------------------- */

export const CreateWarehouseSchema = z.object({
  code: z.string().min(2).max(32),
  name: z.string().min(2).max(200),
  isActive: z.boolean().optional(),
});
export type CreateWarehouse = z.infer<typeof CreateWarehouseSchema>;

export const UpdateWarehouseSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWarehouse = z.infer<typeof UpdateWarehouseSchema>;

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface ListDto<T> {
  items: T[];
  total: number;
}

/* ----------------------------- sample document ----------------------------- */

export const PostSampleDocumentSchema = z.object({
  code: z.string().min(2).max(32),
  totalAmount: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/, 'decimal(18,4) as string'),
  /** injects a failure AFTER partial writes — proves all-or-nothing rollback */
  simulateFailureAfterWrites: z.boolean().optional(),
});
export type PostSampleDocument = z.infer<typeof PostSampleDocumentSchema>;
