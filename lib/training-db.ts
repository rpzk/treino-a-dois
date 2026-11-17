import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import {
  isValidTrainingProfileId,
  profileKeyForPatient,
} from "@/lib/training-profile";
import type { StoredProfile } from "@/lib/training-store";

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

/** True when training data lives in Postgres (`fitcore.profiles`); SQLite is local-dev only. */
export function usePostgresStore(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

// Loaded lazily so SQLite-only environments never import `pg`.
async function pgStore(): Promise<typeof import("@/lib/training-store")> {
  return import("@/lib/training-store");
}

export type TrainingOwner = {
  /** Required for Postgres; ignored by the SQLite dev fallback. */
  tenantSchema?: string | null;
  patientFhirId: string;
};

const FHIR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function pgKey(owner: TrainingOwner): { tenantSchema: string; patientFhirId: string } {
  const tenantSchema = (owner.tenantSchema || "").trim();
  if (!tenantSchema) throw new Error("tenant_schema obrigatório");
  return { tenantSchema, patientFhirId: owner.patientFhirId.trim().toLowerCase() };
}

async function getPgProfile(owner: TrainingOwner): Promise<StoredProfile | null> {
  const { getProfileState } = await pgStore();
  return getProfileState(pgKey(owner));
}

/** Profile id the client uses for this patient, or null when not provisioned. */
export async function findLinkedProfile(owner: TrainingOwner): Promise<string | null> {
  if (usePostgresStore()) {
    const stored = await getPgProfile(owner);
    return stored ? profileKeyForPatient(stored.patientFhirId) : null;
  }
  return findProfileByHealthcorePatientId(owner.patientFhirId);
}

export async function findLinkedDisplayName(owner: TrainingOwner): Promise<string | null> {
  if (usePostgresStore()) {
    const stored = await getPgProfile(owner);
    return stored?.displayName?.trim() || null;
  }
  const profile = await findProfileByHealthcorePatientId(owner.patientFhirId);
  return profile ? findDisplayNameByProfile(profile) : null;
}

export type TrainingSnapshot = {
  profile: string;
  state: unknown;
  revision: number;
};

/** Current stored training state for the patient, or null when not provisioned. */
export async function readTrainingState(
  owner: TrainingOwner,
): Promise<TrainingSnapshot | null> {
  if (usePostgresStore()) {
    const stored = await getPgProfile(owner);
    if (!stored) return null;
    return {
      profile: profileKeyForPatient(stored.patientFhirId),
      state: stored.state,
      revision: stored.revision,
    };
  }
  const profile = await findProfileByHealthcorePatientId(owner.patientFhirId);
  if (!profile) return null;
  const row = await database()
    .prepare("SELECT data,revision FROM training WHERE profile=?")
    .bind(profile)
    .first<{ data: string; revision: number }>();
  return {
    profile,
    state: row ? JSON.parse(row.data) : JSON.parse(BLANK_STATE),
    revision: row?.revision ?? 0,
  };
}

export type WriteTrainingResult =
  | { revision: number }
  | { conflict: true }
  | { notFound: true };

/** Compare-and-swap write of an already-validated state. */
export async function writeTrainingState(
  owner: TrainingOwner,
  state: unknown,
  expectedRevision: number,
): Promise<WriteTrainingResult> {
  if (usePostgresStore()) {
    const { getProfileState, saveProfileState } = await pgStore();
    const key = pgKey(owner);
    // saveProfileState reports missing profile and stale revision identically.
    if (!(await getProfileState(key))) return { notFound: true };
    return saveProfileState(key, state as never, expectedRevision);
  }
  const profile = await findProfileByHealthcorePatientId(owner.patientFhirId);
  if (!profile) return { notFound: true };
  const result = await database()
    .prepare(
      "UPDATE training SET data=?,revision=revision+1 WHERE profile=? AND revision=?",
    )
    .bind(JSON.stringify(state), profile, expectedRevision)
    .run();
  return result.meta.changes === 1
    ? { revision: expectedRevision + 1 }
    : { conflict: true };
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

/**
 * One-shot ops helper (SQLite): attach a HealthCore `patient_fhir_id` to an
 * existing training row (typically `lucas` / `natalia`) without renaming the
 * profile key. Prefer this over `provisionProfileForPatient` when you need to
 * keep legacy profile ids and their training history.
 *
 * Postgres stores `(tenant_schema, patient_fhir_id)` directly — link there via
 * provision / migrate-sqlite-to-pg after SQLite rows are linked.
 */
export async function linkExistingProfileToPatient(
  profile: string,
  patientFhirId: string,
): Promise<{ profile: string; healthcore_patient_id: string }> {
  if (usePostgresStore()) {
    throw new Error(
      "linkExistingProfileToPatient is SQLite-only; use provisionProfileForPatient or migrate-sqlite-to-pg",
    );
  }
  const profileId = profile.trim();
  if (!isValidTrainingProfileId(profileId)) {
    throw new Error("profile inválido");
  }
  const patientId = patientFhirId.trim().toLowerCase();
  if (!FHIR_ID_RE.test(patientId)) {
    throw new Error("patient_fhir_id inválido");
  }

  const existingLink = await findProfileByHealthcorePatientId(patientId);
  if (existingLink && existingLink !== profileId) {
    throw new Error(
      `patient_fhir_id já vinculado ao perfil ${existingLink}`,
    );
  }

  const row = await database()
    .prepare(`SELECT profile, healthcore_patient_id FROM training WHERE profile = ?`)
    .bind(profileId)
    .first<{ profile: string; healthcore_patient_id: string | null }>();

  if (!row) {
    await database()
      .prepare(
        `INSERT INTO training(profile, data, revision, healthcore_patient_id)
         VALUES(?, ?, 0, ?)`,
      )
      .bind(profileId, BLANK_STATE, patientId)
      .run();
  } else {
    const current = row.healthcore_patient_id?.trim().toLowerCase() || null;
    if (current && current !== patientId) {
      throw new Error(
        `perfil ${profileId} já vinculado a outro patient_fhir_id`,
      );
    }
    if (current !== patientId) {
      await database()
        .prepare(
          `UPDATE training SET healthcore_patient_id = ? WHERE profile = ?`,
        )
        .bind(patientId, profileId)
        .run();
    }
  }

  return { profile: profileId, healthcore_patient_id: patientId };
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
  tenantSchema: string;
  patientFhirId: string;
  displayName?: string | null;
}): Promise<ProvisionResult> {
  const tenantSchema = (input.tenantSchema || "").trim();
  const patientFhirId = input.patientFhirId.trim().toLowerCase();
  if (!FHIR_ID_RE.test(patientFhirId)) {
    throw new Error("patient_fhir_id inválido");
  }
  const displayName = (input.displayName || "").trim().slice(0, 120) || null;

  if (usePostgresStore()) {
    if (!tenantSchema) throw new Error("tenant_schema inválido");
    const { provisionProfile, getProfileState } = await pgStore();
    const { created } = await provisionProfile({
      tenantSchema,
      patientFhirId,
      displayName,
    });
    const stored = await getProfileState({ tenantSchema, patientFhirId });
    return {
      profile: profileKeyForPatient(patientFhirId),
      patient_fhir_id: patientFhirId,
      created,
      display_name: stored?.displayName ?? displayName,
    };
  }

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
  if (usePostgresStore()) {
    throw new Error("SQLite database() is unavailable when DATABASE_URL is set");
  }
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
