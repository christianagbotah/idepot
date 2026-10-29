/**
 * Catalog domain: products, categories, units, unit conversions, barcodes.
 * Two-level category tree (legacy item_main_category → item_category).
 */
import { ValidationError } from './errors.js';

export const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/;

export type ProductStatus = 'active' | 'inactive' | 'archived';

export interface NewProduct {
  code: string;
  name: string;
  baseUnitId: string;
  description?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  brandId?: string | null;
  defaultSaleUnitId?: string | null;
  soldInUnits?: boolean;
  sellingPrice?: string;
  purchasePrice?: string | null;
  status?: ProductStatus;
}

export function validateNewProduct(p: NewProduct): void {
  if (!CODE_RE.test(p.code)) throw new ValidationError(`product code "${p.code}" is invalid`);
  if (p.name.trim().length < 2 || p.name.length > 300) {
    throw new ValidationError('product name must be 2–300 characters');
  }
  if (!p.baseUnitId || p.baseUnitId.length < 20) {
    throw new ValidationError('product requires a base unit (SMU)');
  }
  if (p.defaultSaleUnitId && p.defaultSaleUnitId === p.baseUnitId) {
    // default sale unit = base is legal; NULL means "sell in base unit".
    // (kept explicit to document the semantics)
  }
}

export interface NewCategory {
  code: string;
  name: string;
  parentId?: string | null;
}

/** Legacy had exactly two levels (item_main_category → item_category). */
export function validateNewCategory(c: NewCategory, parentHasParent: boolean): void {
  if (!CODE_RE.test(c.code)) throw new ValidationError(`category code "${c.code}" is invalid`);
  if (c.name.trim().length < 2 || c.name.length > 200) {
    throw new ValidationError('category name must be 2–200 characters');
  }
  if (parentHasParent) {
    throw new ValidationError('category tree is limited to two levels (main → sub)');
  }
}

export interface NewUnit {
  code: string;
  name: string;
}

export function validateNewUnit(u: NewUnit): void {
  if (!CODE_RE.test(u.code)) throw new ValidationError(`unit code "${u.code}" is invalid`);
  if (u.name.trim().length < 1 || u.name.length > 100) {
    throw new ValidationError('unit name must be 1–100 characters');
  }
}

export interface NewProductUnit {
  productId: string;
  unitId: string;
  /** exact decimal(18,6): how many base units one of this unit contains */
  conversionFactor: string;
  price?: string | null;
  isDefaultSale?: boolean;
}

export function validateNewProductUnit(pu: NewProductUnit, baseUnitId: string): void {
  if (pu.unitId === baseUnitId) {
    throw new ValidationError('the base unit itself cannot be re-declared as a conversion');
  }
  if (!pu.productId || !pu.unitId) throw new ValidationError('product unit requires product and unit');
}

export function validateBarcode(barcode: string): void {
  const b = barcode.trim();
  if (b.length < 3 || b.length > 64) {
    throw new ValidationError('barcode must be 3–64 characters');
  }
  if (!/^[A-Za-z0-9-_.+ ]+$/.test(b)) {
    throw new ValidationError(`barcode "${barcode}" contains invalid characters`);
  }
}
