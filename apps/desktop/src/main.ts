/**
 * iDepot desktop frontend bootstrap (runs INSIDE the Tauri webview).
 *
 * Boots the offline engine over the Tauri SQLite plugin and wires the
 * hardware HAL. The POS UI itself is the iDepot web app — this module adds
 * the desktop-only capabilities around it.
 *
 * Build prerequisites / verification honesty (PHASE6 handoff B1):
 *  - `npm run tauri build` needs Rust + the OS-specific toolchain
 *    (Windows: MSVC + WiX for MSI/NSIS; macOS: Xcode CLT for DMG).
 *  - CI produces installers ONLY on matching runners (see
 *    .github/workflows/desktop.yml, gated by runner availability).
 *  - No Windows/macOS installer may be CLAIMED without an actual signed
 *    build from the corresponding host — this repo's CI evidence must
 *    show the artifact, or the capability stays "source-ready".
 */
import { OfflineEngine, type OfflineStorage, OFFLINE_SCHEMA } from '@idepot/offline';
import { Database } from '@tauri-apps/plugin-sql';

/** SQLite-backed storage implementing the engine's driver surface. */
class TauriSqlStorage implements OfflineStorage {
  private constructor(private readonly db: Database) {}

  static async open(path = 'sqlite:idepot-offline.db'): Promise<TauriSqlStorage> {
    const db = await Database.load(path);
    return new TauriSqlStorage(db);
  }

  async exec(sql: string, params: unknown[] = []): Promise<number> {
    const res = (await this.db.execute(sql, params)) as { rowsAffected: number };
    return res.rowsAffected ?? 0;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = (await this.db.select(sql, params)) as T[];
    return res;
  }

  /**
   * SQLite serializes writers — a JS-side transaction bracket is emulated
   * with BEGIN/COMMIT/ROLLBACK. For the atomic capture pair this is
   * sufficient on-device (single writer); production hardening wraps the
   * engine calls in a dedicated mutex (see roadmap: 50-terminal chaos
   * results drive any strengthening).
   */
  async transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.exec('BEGIN');
    try {
      const out = await fn();
      await this.exec('COMMIT');
      return out;
    } catch (err) {
      await this.exec('ROLLBACK');
      throw err;
    }
  }
}

export async function bootOfflineEngine(opts: {
  deviceId: string;
  apiBaseUrl: string;
  accessToken: string;
}): Promise<OfflineEngine> {
  const storage = await TauriSqlStorage.open();
  for (const ddl of OFFLINE_SCHEMA) await storage.exec(ddl);

  const transport = {
    push: async (_deviceId: string, events: Array<Record<string, unknown>>) => {
      const res = await fetch(`${opts.apiBaseUrl}/api/sync/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.accessToken}` },
        body: JSON.stringify({ deviceId: opts.deviceId, events }),
      });
      if (!res.ok) throw new Error(`sync push HTTP ${res.status}`);
      const body = (await res.json()) as { outcomes: unknown[] };
      return body.outcomes as never;
    },
    pull: async (cursor: string | null, limit: number) => {
      const qs = new URLSearchParams({ ...(cursor ? { cursor } : {}), limit: String(limit) });
      const res = await fetch(`${opts.apiBaseUrl}/api/sync/pull?${qs}`, {
        headers: { authorization: `Bearer ${opts.accessToken}` },
      });
      if (!res.ok) throw new Error(`sync pull HTTP ${res.status}`);
      return (await res.json()) as never;
    },
  };

  return new OfflineEngine({
    deviceId: opts.deviceId,
    storage,
    transport,
    projectors: {
      // replica projections identical to the mobile app (shared engine)
      'product.updated': (payload, s) => {
        void s.exec(
          `INSERT INTO replica_products (id, code, name, unit_id, selling_price, purchase_price, barcode, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [payload.id, payload.code, payload.name, payload.unitId, payload.sellingPrice, payload.purchasePrice, payload.barcode, String(payload.version ?? '')],
        );
      },
    },
  });
}
