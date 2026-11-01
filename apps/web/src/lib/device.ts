'use client';

import { apiFetch } from './api';
import type { Session } from './types';

/**
 * Web-PWA device identity for the offline sync (offline-sync §2/§3): the
 * browser POS registers ONE device per tenant+user+browser and caches the
 * id in localStorage. The id scopes document-number lease validation and
 * the sync idempotency registry; it is not a security boundary (the push
 * permission comes from the session token).
 */
const DEVICE_KEY = 'idepot.device';

export function readDeviceId(session: Session | null): string | null {
  if (typeof window === 'undefined' || !session) return null;
  const key = `${DEVICE_KEY}.${session.user.tenantId}.${session.user.id}`;
  return window.localStorage.getItem(key);
}

export async function ensureDeviceId(session: Session): Promise<string> {
  const existing = readDeviceId(session);
  if (existing) return existing;
  const deviceCode = `WEB-PWA-${session.user.tenantSlug}-${session.user.id.slice(0, 8)}`;
  const res = await apiFetch<{ id: string }>('/auth/devices', {
    method: 'POST',
    token: session.accessToken,
    body: { deviceCode, platform: 'web-pwa' },
  });
  const key = `${DEVICE_KEY}.${session.user.tenantId}.${session.user.id}`;
  window.localStorage.setItem(key, res.id);
  return res.id;
}
