import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "training.sqlite");

type Row = Record<string, unknown>;

type Prepared = {
  bind(...values: SQLInputValue[]): Prepared;
  first<T extends Row>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
  all<T extends Row>(): Promise<{ results: T[] }>;
};

type Database = {
  prepare(sql: string): Prepared;
};

let sqlite: DatabaseSync | null = null;

function dbPath(): string {
  return process.env.SQLITE_PATH?.trim() || DEFAULT_DB_PATH;
}

function getSqlite(): DatabaseSync {
  if (sqlite) return sqlite;

  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  sqlite = new DatabaseSync(file);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS training (
      profile text PRIMARY KEY NOT NULL,
      data text NOT NULL,
      revision integer DEFAULT 0 NOT NULL
    );
  `);
  return sqlite;
}

/** D1-shaped wrapper over Node's built-in SQLite for the training API routes. */
export function database(): Database {
  const db = getSqlite();

  return {
    prepare(sql: string): Prepared {
      let params: SQLInputValue[] = [];

      const prepared: Prepared = {
        bind(...values: SQLInputValue[]) {
          params = values;
          return prepared;
        },
        async first<T extends Row>() {
          const row = db.prepare(sql).get(...params);
          return (row as T | undefined) ?? null;
        },
        async run() {
          const result = db.prepare(sql).run(...params);
          return { meta: { changes: Number(result.changes ?? 0) } };
        },
        async all<T extends Row>() {
          const rows = db.prepare(sql).all(...params);
          return { results: rows as T[] };
        },
      };

      return prepared;
    },
  };
}
