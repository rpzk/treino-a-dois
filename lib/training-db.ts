import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { profileKeyForPatient } from "@/lib/training-profile";

export { isValidTrainingProfileId } from "@/lib/training-profile";

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
  const columnNames = () =>
    (
      db.prepare(`PRAGMA table_info(training)`).all() as Array<{ name: string }>
    ).map((column) => column.name);

  if (!columnNames().includes("healthcore_patient_id")) {
    db.exec(`ALTER TABLE training ADD COLUMN healthcore_patient_id text`);
  }
  if (!columnNames().includes("display_name")) {
    db.exec(`ALTER TABLE training ADD COLUMN display_name text`);
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS training_healthcore_patient_id_uidx
    ON training(healthcore_patient_id)
    WHERE healthcore_patient_id IS NOT NULL
  `);
}

const BLANK_STATE = JSON.stringify({
  workouts: [],
  sessions: [],
  active: null,
  timer: null,
});

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

export async function findDisplayNameByProfile(
  profile: string,
): Promise<string | null> {
  const row = await database()
    .prepare(`SELECT display_name FROM training WHERE profile = ? LIMIT 1`)
    .bind(profile)
    .first<{ display_name: string | null }>();
  return row?.display_name?.trim() || null;
}

export type ProvisionResult = {
  profile: string;
  patient_fhir_id: string;
  created: boolean;
  display_name: string | null;
};

/** Idempotent: link existing row or create hc_<uuid> profile for this patient. */
export async function provisionProfileForPatient(input: {
  patientFhirId: string;
  displayName?: string | null;
}): Promise<ProvisionResult> {
  const patientFhirId = input.patientFhirId.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(patientFhirId)) {
    throw new Error("patient_fhir_id inválido");
  }
  const displayName = (input.displayName || "").trim().slice(0, 120) || null;

  const existing = await findProfileByHealthcorePatientId(patientFhirId);
  if (existing) {
    if (displayName) {
      await database()
        .prepare(`UPDATE training SET display_name = ? WHERE profile = ?`)
        .bind(displayName, existing)
        .run();
    }
    const name = displayName || (await findDisplayNameByProfile(existing));
    return {
      profile: existing,
      patient_fhir_id: patientFhirId,
      created: false,
      display_name: name,
    };
  }

  const profile = profileKeyForPatient(patientFhirId);
  await database()
    .prepare(
      `INSERT INTO training(profile, data, revision, healthcore_patient_id, display_name)
       VALUES(?, ?, 0, ?, ?)`,
    )
    .bind(profile, BLANK_STATE, patientFhirId, displayName)
    .run();

  return {
    profile,
    patient_fhir_id: patientFhirId,
    created: true,
    display_name: displayName,
  };
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
