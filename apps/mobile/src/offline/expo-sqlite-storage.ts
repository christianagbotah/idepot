/**
 * expo-sqlite adapter for the shared offline engine (@idepot/offline).
 *
 * The engine's StorageDriver is deliberately tiny; this adapter is the
 * whole React Native binding. Transaction semantics: expo-sqlite exposes
 * withTransaction; a crash inside rolls the group back (SQLite journal).
 */
import SQLite, { type SQLiteDatabase } from 'expo-sqlite';
import type { OfflineStorage } from '@idepot/offline';

export class ExpoSqliteStorage implements OfflineStorage {
  private constructor(private readonly db: SQLiteDatabase) {}

  static async open(name = 'idepot-offline.db'): Promise<ExpoSqliteStorage> {
    const db = await SQLite.openDatabaseAsync(name);
    return new ExpoSqliteStorage(db);
  }

  async exec(sql: string, params: unknown[] = []): Promise<number> {
    const res = await this.db.runAsync(sql, ...(params as never[]));
    return res.changes ?? 0;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.db.getAllAsync(sql, ...(params as never[]))) as T[];
  }

  async transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    return this.db.withTransactionAsync(async () => fn());
  }
}
