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
      revision integer DEFAULT 0 NOT NULL,
      healthcore_patient_id text
    );
  `);
  ensureHealthcorePatientIdColumn(sqlite);
  return sqlite;
}

function ensureHealthcorePatientIdColumn(db: DatabaseSync): void {
  const columns = db.prepare(`PRAGMA table_info(training)`).all() as Array<{
    name: string;
  }>;
  const hasColumn = columns.some((column) => column.name === "healthcore_patient_id");
  if (!hasColumn) {
    db.exec(`ALTER TABLE training ADD COLUMN healthcore_patient_id text`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS training_healthcore_patient_id_uidx
    ON training(healthcore_patient_id)
    WHERE healthcore_patient_id IS NOT NULL
  `);
}

export async function findProfileByHealthcorePatientId(
  patientId: string,
): Promise<string | null> {
  const trimmed = patientId.trim();
  if (!trimmed) return null;
  const row = await database()
    .prepare(
      `SELECT profile FROM training WHERE healthcore_patient_id = ? LIMIT 1`,
    )
    .bind(trimmed)
    .first<{ profile: string }>();
  return row?.profile ?? null;
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
