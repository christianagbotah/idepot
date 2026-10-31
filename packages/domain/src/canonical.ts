/**
 * Canonical JSON + request fingerprint (Phase 3 hardening, review
 * finding #5). The offline-sync idempotency contract needs a STABLE
 * identity for "the same payload": key order in the source JSON must not
 * matter, so the canonical form sorts object keys recursively and emits
 * no insignificant whitespace. The fingerprint is SHA-256 over the
 * canonical serialization of the event identity { type, payload }.
 */
import { createHash } from 'node:crypto';

/**
 * Deterministic serialization of a JSON value:
 * - object keys sorted lexicographically (recursively);
 * - no whitespace;
 * - numbers via their shortest round-trip form (JS number formatting is
 *   deterministic for a given value);
 * - `undefined` is rejected (it has no JSON meaning — callers must pass
 *   plain JSON data).
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonical JSON cannot serialize non-finite numbers');
      return String(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new TypeError(`canonical JSON cannot serialize ${typeof value}`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => serialize(v === undefined ? null : v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  const parts: string[] = [];
  for (const k of keys) parts.push(`${JSON.stringify(k)}:${serialize(obj[k])}`);
  return `{${parts.join(',')}}`;
}

/** SHA-256 hex fingerprint of the canonical form. */
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/** The sync-event identity fingerprint: same key + same payload ⇒ same
 *  value; any payload difference (or type difference) ⇒ different value. */
export function syncEventFingerprint(eventType: string, payload: unknown): string {
  return fingerprint({ type: eventType, payload });
}
