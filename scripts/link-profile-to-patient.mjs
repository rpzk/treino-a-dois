#!/usr/bin/env node
/**
 * FitCore — one-shot link of a SQLite training profile key to a HealthCore patient.
 *
 * Prefer provisioning `hc_<patient_fhir_id without dashes>` (or POST /api/internal/provision).
 * This script accepts any safe ops profile key; retired demo keys `lucas` / `natalia`
 * are rejected.
 *
 *   node scripts/link-profile-to-patient.mjs \
 *     --profile hc_9dd61833321d4cf7aad6aaf75950df91 \
 *     --patient-fhir-id 9dd61833-321d-4cf7-aad6-aaf75950df91 \
 *     [--sqlite /app/data/training.sqlite]
 *
 * Postgres: use provision / migrate-sqlite-to-pg after SQLite is linked.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

const FHIR_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OPS_PROFILE_RE = /^[a-z][a-z0-9_]{1,63}$/;
const RETIRED_DEMO = new Set(["lucas", "natalia"]);

const argv = process.argv.slice(2).filter((arg) => arg !== "--");
const { values: args } = parseArgs({
  args: argv,
  options: {
    profile: { type: "string" },
    "patient-fhir-id": { type: "string" },
    sqlite: { type: "string" },
  },
});

const profile = (args.profile || "").trim();
const patientFhirId = (args["patient-fhir-id"] || "").trim().toLowerCase();
const sqlitePath =
  args.sqlite || process.env.SQLITE_PATH || path.join(process.cwd(), "data", "training.sqlite");

if (!profile || !patientFhirId) {
  console.error(
    "usage: link-profile-to-patient.mjs --profile <ops-key|hc_<32hex>> --patient-fhir-id <uuid> [--sqlite path]",
  );
  process.exit(2);
}
if (process.env.DATABASE_URL?.trim()) {
  console.error(
    "DATABASE_URL is set; unset it for this SQLite-only linker (or use provision / migrate-sqlite-to-pg).",
  );
  process.exit(2);
}
if (RETIRED_DEMO.has(profile)) {
  console.error(
    "perfil demo legado (lucas/natalia) não é mais suportado; provisione hc_<fhir> e apague a linha no SQLite",
  );
  process.exit(2);
}
if (!OPS_PROFILE_RE.test(profile)) {
  console.error(`profile inválido: ${profile}`);
  process.exit(2);
}
if (!FHIR_ID_RE.test(patientFhirId)) {
  console.error(`patient_fhir_id inválido: ${patientFhirId}`);
  process.exit(2);
}

fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
const db = new DatabaseSync(sqlitePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS training (
    profile text PRIMARY KEY NOT NULL,
    data text NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    healthcore_patient_id text
  );
`);
const columns = db
  .prepare(`PRAGMA table_info(training)`)
  .all()
  .map((column) => column.name);
if (!columns.includes("healthcore_patient_id")) {
  db.exec(`ALTER TABLE training ADD COLUMN healthcore_patient_id text`);
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS training_healthcore_patient_id_uidx
  ON training(healthcore_patient_id)
  WHERE healthcore_patient_id IS NOT NULL
`);

const blank = JSON.stringify({
  workouts: [],
  sessions: [],
  active: null,
  timer: null,
});

const taken = db
  .prepare(
    `SELECT profile FROM training WHERE healthcore_patient_id = ? LIMIT 1`,
  )
  .get(patientFhirId);
if (taken && taken.profile !== profile) {
  console.error(
    `patient_fhir_id já vinculado ao perfil ${taken.profile}`,
  );
  process.exit(1);
}

const row = db
  .prepare(`SELECT profile, healthcore_patient_id FROM training WHERE profile = ?`)
  .get(profile);

if (!row) {
  db.prepare(
    `INSERT INTO training(profile, data, revision, healthcore_patient_id)
     VALUES(?, ?, 0, ?)`,
  ).run(profile, blank, patientFhirId);
} else {
  const current = String(row.healthcore_patient_id || "")
    .trim()
    .toLowerCase();
  if (current && current !== patientFhirId) {
    console.error(`perfil ${profile} já vinculado a outro patient_fhir_id`);
    process.exit(1);
  }
  if (current !== patientFhirId) {
    db.prepare(
      `UPDATE training SET healthcore_patient_id = ? WHERE profile = ?`,
    ).run(patientFhirId, profile);
  }
}

const linked = db
  .prepare(
    `SELECT profile FROM training WHERE healthcore_patient_id = ? LIMIT 1`,
  )
  .get(patientFhirId);

console.log(
  JSON.stringify(
    {
      ok: true,
      profile: linked.profile,
      healthcore_patient_id: patientFhirId,
      sqlite: sqlitePath,
    },
    null,
    2,
  ),
);
