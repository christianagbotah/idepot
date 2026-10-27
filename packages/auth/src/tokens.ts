/**
 * Token issuance/verification (HS256). Access tokens are short-lived and carry
 * the tenant binding; refresh tokens are longer-lived, separate type, and are
 * bound to a device when supplied. This module is framework-free.
 */
import jwt, { type SignOptions } from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string;
  tenant: string;
  roles: string[];
  displayName: string;
  typ: 'access';
  jti: string;
}

export interface RefreshTokenPayload {
  sub: string;
  tenant: string;
  typ: 'refresh';
  jti: string;
  device?: string;
}

const ACCESS_TTL_SECONDS = Number(process.env.IDEPOT_JWT_ACCESS_TTL_SECONDS ?? 900);
const REFRESH_TTL_SECONDS = Number(process.env.IDEPOT_JWT_REFRESH_TTL_SECONDS ?? 30 * 86400);

function secret(): string {
  const s = process.env.IDEPOT_JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error('IDEPOT_JWT_SECRET must be set (>=16 chars)');
  }
  return s;
}

export function signAccessToken(p: Omit<AccessTokenPayload, 'typ' | 'jti'>): string {
  const opts: SignOptions = { expiresIn: ACCESS_TTL_SECONDS, algorithm: 'HS256' };
  return jwt.sign({ ...p, typ: 'access', jti: crypto.randomUUID() }, secret(), opts);
}

export function signRefreshToken(p: Omit<RefreshTokenPayload, 'typ' | 'jti'>): string {
  const opts: SignOptions = { expiresIn: REFRESH_TTL_SECONDS, algorithm: 'HS256' };
  return jwt.sign({ ...p, typ: 'refresh', jti: crypto.randomUUID() }, secret(), opts);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret(), { algorithms: ['HS256'] });
  const p = decoded as AccessTokenPayload;
  if (p.typ !== 'access') throw new jwt.JsonWebTokenError('wrong token type');
  return p;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, secret(), { algorithms: ['HS256'] });
  const p = decoded as RefreshTokenPayload;
  if (p.typ !== 'refresh') throw new jwt.JsonWebTokenError('wrong token type');
  return p;
}

export const TOKEN_TTLS = { access: ACCESS_TTL_SECONDS, refresh: REFRESH_TTL_SECONDS };
