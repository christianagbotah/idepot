/**
 * MySQL dump parser (fallback staging source).
 * Handles mysqldump-style INSERT statements with escaped string literals,
 * NULL, numeric literals and _binary prefixes. Yields canonical LegacyRows.
 * The primary CI/local path is the MySQL protocol source; this parser keeps
 * the pipeline runnable on hosts without a MySQL server.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { LegacyRow } from './types.js';

export interface ParsedDump {
  /** table -> ordered rows (file order) */
  tables: Map<string, LegacyRow[]>;
  fingerprint: string;
}

export function parseMysqlDump(sql: string): ParsedDump {
  const fingerprint = createHash('sha256').update(sql).digest('hex');
  const tables = new Map<string, LegacyRow[]>();

  let i = 0;
  const n = sql.length;
  while (i < n) {
    const insertAt = sql.indexOf('INSERT INTO', i);
    if (insertAt < 0) break;
    // skip to table name
    let j = insertAt + 'INSERT INTO'.length;
    while (j < n && /\s/.test(sql[j]!)) j++;
    if (sql[j] === '`') {
      const end = sql.indexOf('`', j + 1);
      var tableName = sql.slice(j + 1, end);
      j = end + 1;
    } else {
      let e = j;
      while (e < n && !/[\s(]/.test(sql[e]!)) e++;
      tableName = sql.slice(j, e);
      j = e;
    }
    while (j < n && /\s/.test(sql[j]!)) j++;
    // column list?
    let columns: string[] | null = null;
    if (sql[j] === '(') {
      const close = matchParen(sql, j);
      columns = splitTopLevel(sql.slice(j + 1, close)).map((c) => c.trim().replace(/^`|`$/g, ''));
      j = close + 1;
    }
    while (j < n && /\s/.test(sql[j]!)) j++;
    if (sql.startsWith('VALUES', j)) j += 'VALUES'.length;

    // parse tuples until statement end
    const rows = tables.get(tableName) ?? [];
    for (;;) {
      while (j < n && /\s/.test(sql[j]!)) j++;
      if (sql[j] !== '(') break;
      const close = matchParen(sql, j);
      const rawValues = splitTuples(sql.slice(j + 1, close));
      const row: LegacyRow = {};
      rawValues.forEach((v, idx) => {
        const col = columns?.[idx] ?? `col${idx}`;
        row[col] = decodeLiteral(v);
      });
      rows.push(row);
      j = close + 1;
      // find next non-space char; ',' = another tuple follows, ';' or anything else = done
      let k = j;
      while (k < n && /[\s;]/.test(sql[k]!)) k++;
      if (sql[k] === ',') {
        j = k + 1;
        continue;
      }
      if (sql[k] !== '(') break;
      j = k;
    }
    tables.set(tableName, rows);
    i = j;
  }
  return { tables, fingerprint };
}

function matchParen(s: string, open: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      if (c === '\\') {
        i++;
      } else if (c === "'") {
        if (s[i + 1] === "'") i++;
        else inStr = false;
      }
      continue;
    }
    if (c === "'") inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced parentheses in dump');
}

/** Splits a VALUES tuple list on top-level commas (tuple-aware). */
function splitTuples(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      if (c === '\\') i++;
      else if (c === "'") {
        if (s[i + 1] === "'") i++;
        else inStr = false;
      }
      continue;
    }
    if (c === "'") inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  if (start < s.length) out.push(s.slice(start));
  return out;
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      if (c === '\\') i++;
      else if (c === "'") inStr = false;
      continue;
    }
    if (c === "'") inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  if (start < s.length) out.push(s.slice(start));
  return out;
}

function decodeLiteral(vRaw: string): string | null {
  let v = vRaw.trim();
  if (v.toUpperCase() === 'NULL') return null;
  if (/^_binary/i.test(v)) v = v.replace(/^_binary/i, '').trim();
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    const body = v.slice(1, -1);
    return unescapeMysql(body);
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  return v;
}

function unescapeMysql(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const d = s[++i];
    switch (d) {
      case '0': out += '\0'; break;
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'Z': out += '\x1a'; break;
      case "'": out += "'"; break;
      case '"': out += '"'; break;
      case '\\': out += '\\'; break;
      case '%': out += '\\%'; break;
      case '_': out += '\\_'; break;
      case undefined: out += '\\'; break;
      default: out += d ?? '';
    }
  }
  return out;
}

/** Fallback source: parse the dump file directly (no MySQL server needed). */
export function createParsedDumpSource(dumpPath: string): {
  backend: 'parsed-dump';
  fingerprint: string;
  readStagedRows: (spec: { table: string }) => Promise<LegacyRow[]>;
  close: () => Promise<void>;
} {
  const parsed = parseMysqlDump(readFileSync(dumpPath, 'utf8'));
  return {
    backend: 'parsed-dump',
    fingerprint: parsed.fingerprint,
    readStagedRows: async (spec) => parsed.tables.get(spec.table) ?? [],
    close: async () => undefined,
  };
}
