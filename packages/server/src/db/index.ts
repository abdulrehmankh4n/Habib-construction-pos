import Database from 'better-sqlite3';
import type { Database as DB, Statement } from 'better-sqlite3';
import { migrations } from './migrations';
import { nowLocal } from '../lib/time';

export type { DB };

export function openDatabase(file: string): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  return db;
}

export function migrate(db: DB): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  let count = 0;
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        nowLocal(),
      );
    })();
    count++;
  }
  return count;
}

interface Prepared {
  statement: Statement;
  names: string[];
}

const cache = new WeakMap<DB, Map<string, Prepared>>();

function prepared(db: DB, sql: string): Prepared {
  let map = cache.get(db);
  if (!map) {
    map = new Map();
    cache.set(db, map);
  }
  let p = map.get(sql);
  if (!p) {
    p = { statement: db.prepare(sql), names: [...new Set([...sql.matchAll(/@([A-Za-z_]\w*)/g)].map((m) => m[1]))] };
    map.set(sql, p);
  }
  return p;
}

export function stmt(db: DB, sql: string): Statement {
  return prepared(db, sql).statement;
}

type Params = Record<string, unknown> | unknown[] | undefined;

function sanitize(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function execute(db: DB, sql: string, params: Params) {
  const p = prepared(db, sql);
  if (params === undefined) return { statement: p.statement, args: [] as unknown[] };
  if (Array.isArray(params)) return { statement: p.statement, args: params.map(sanitize) };
  const named: Record<string, unknown> = {};
  for (const name of p.names) named[name] = sanitize(params[name]);
  return { statement: p.statement, args: [named] };
}

export function one<T>(db: DB, sql: string, params?: Params): T | undefined {
  const { statement, args } = execute(db, sql, params);
  return statement.get(...args) as T | undefined;
}

export function all<T>(db: DB, sql: string, params?: Params): T[] {
  const { statement, args } = execute(db, sql, params);
  return statement.all(...args) as T[];
}

export function run(db: DB, sql: string, params?: Params) {
  const { statement, args } = execute(db, sql, params);
  return statement.run(...args);
}

export function tx<T>(db: DB, fn: () => T): T {
  return db.transaction(fn).immediate();
}
