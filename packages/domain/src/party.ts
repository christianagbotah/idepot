/**
 * Parties domain: customers and suppliers. Ghana phone-first identity —
 * a phone number is required, email is always optional.
 */
import { ValidationError } from './errors.js';

const PHONE_RE = /^[0-9+][0-9 ()-]{6,24}$/;

export type PartyStatus = 'active' | 'inactive';

export interface NewCustomer {
  code: string;
  name: string;
  phone: string;
  contactPerson?: string | null;
  altPhone?: string | null;
  email?: string | null;
  address?: string | null;
  isGuest?: boolean;
  status?: PartyStatus;
}

export interface NewSupplier {
  code: string;
  name: string;
  phone: string;
  contactPerson?: string | null;
  altPhone?: string | null;
  email?: string | null;
  address?: string | null;
  status?: PartyStatus;
}

function validateParty(p: { code: string; name: string; phone: string; email?: string | null }, kind: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(p.code)) {
    throw new ValidationError(`${kind} code "${p.code}" is invalid`);
  }
  if (p.name.trim().length < 2 || p.name.length > 300) {
    throw new ValidationError(`${kind} name must be 2–300 characters`);
  }
  if (!PHONE_RE.test(p.phone.trim())) {
    throw new ValidationError(`${kind} phone "${p.phone}" is not a valid phone number (phone-first identity)`);
  }
  if (p.email != null && p.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
    throw new ValidationError(`${kind} email "${p.email}" is invalid`);
  }
}

export function validateNewCustomer(c: NewCustomer): void {
  validateParty(c, 'customer');
}

export function validateNewSupplier(s: NewSupplier): void {
  validateParty(s, 'supplier');
}
