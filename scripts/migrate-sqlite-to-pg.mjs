#!/usr/bin/env node
/**
 * One-shot migration: SQLite `training` table -> Postgres `fitcore.profiles`.
 *
 *   node scripts/migrate-sqlite-to-pg.mjs \
 *     [--sqlite /app/data/training.sqlite] \
 *     [--database-url postgres://...]   (default: $DATABASE_URL) \
 *     [--tenant clinica_rp] \
 *     [--dry-run] [--force]
 *
 * - Only rows linked to HealthCore (healthcore_patient_id, or an `hc_<32hex>`
 *   profile key) are migrated. Legacy local profiles (lucas/natalia) are skipped.
 * - Idempotent: existing (tenant, patient) rows are left untouched unless --force.
 * - The SQLite file is opened read-only and never modified.
 */
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

import pg from "pg";

const { values: args } = parseArgs({
  options: {
    sqlite: { type: "string" },
    "database-url": { type: "string" },
    tenant: { type: "string", default: "clinica_rp" },
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});

const sqlitePath =
  args.sqlite || process.env.SQLITE_PATH || "/app/data/training.sqlite";
const databaseUrl = args["database-url"] || process.env.DATABASE_URL;
const tenant = args.tenant.trim();
const dryRun = args["dry-run"];
const force = args.force;

if (!databaseUrl) {
  console.error("DATABASE_URL (or --database-url) is required");
  process.exit(2);
}
if (!/^[a-z_][a-z0-9_]*$/.test(tenant)) {
  console.error(`invalid --tenant: ${tenant}`);
  process.exit(2);
}
if (!fs.existsSync(sqlitePath)) {
  console.error(`sqlite file not found: ${sqlitePath}`);
  process.exit(2);
}

/** Keep in sync with lib/training-store.ts BOOTSTRAP_SQL. */
const BOOTSTRAP_SQL = `
  CREATE SCHEMA IF NOT EXISTS fitcore;
  CREATE TABLE IF NOT EXISTS fitcore.profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_schema text NOT NULL,
    patient_fhir_id text NOT NULL,
    display_name text,
    revision integer NOT NULL DEFAULT 0,
    state jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT profiles_tenant_patient_uidx UNIQUE (tenant_schema, patient_fhir_id)
  );
`;
const BOOTSTRAP_LOCK_KEY = 704110501;

const FHIR_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function uuidFromHex32(hex) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Resolve the patient FHIR id for a SQLite row, or null if not HealthCore-linked. */
function patientIdFor(row) {
  const linked = String(row.healthcore_patient_id ?? "").trim().toLowerCase();
  if (linked) return linked;
  const m = /^hc_([0-9a-f]{32})$/.exec(String(row.profile));
  return m ? uuidFromHex32(m[1]) : null;
}

function validState(state) {
  return (
    state &&
    typeof state === "object" &&
    Array.isArray(state.workouts) &&
    Array.isArray(state.sessions)
  );
}

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const columns = sqlite
  .prepare("PRAGMA table_info(training)")
  .all()
  .map((c) => c.name);
const hasDisplay = columns.includes("display_name");
const rows = sqlite
  .prepare(
    `SELECT profile, data, revision, healthcore_patient_id,
            ${hasDisplay ? "display_name" : "NULL AS display_name"}
       FROM training ORDER BY profile`,
  )
  .all();
sqlite.close();

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const summary = { source: rows.length, inserted: 0, updated: 0, skipped_existing: 0, skipped_unlinked: 0, invalid: 0 };

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [BOOTSTRAP_LOCK_KEY]);
    await client.query(BOOTSTRAP_SQL);

    for (const row of rows) {
      const patientId = patientIdFor(row);
      if (!patientId || !FHIR_ID_RE.test(patientId)) {
        summary.skipped_unlinked++;
        console.log(`skip (not HealthCore-linked): ${row.profile}`);
        continue;
      }
      let state;
      try {
        state = JSON.parse(row.data);
      } catch {
        state = null;
      }
      if (!validState(state)) {
        summary.invalid++;
        console.error(`invalid state JSON, skipped: ${row.profile}`);
        continue;
      }
      const displayName = row.display_name ? String(row.display_name).trim() || null : null;
      const revision = Number(row.revision) || 0;

      const sql = force
        ? `INSERT INTO fitcore.profiles (tenant_schema, patient_fhir_id, display_name, revision, state)
             VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (tenant_schema, patient_fhir_id) DO UPDATE
             SET display_name = EXCLUDED.display_name, revision = EXCLUDED.revision,
                 state = EXCLUDED.state, updated_at = now()
           RETURNING (xmax = 0) AS inserted`
        : `INSERT INTO fitcore.profiles (tenant_schema, patient_fhir_id, display_name, revision, state)
             VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (tenant_schema, patient_fhir_id) DO NOTHING
           RETURNING true AS inserted`;
      const res = await client.query(sql, [
        tenant,
        patientId,
        displayName,
        revision,
        JSON.stringify(state),
      ]);
      if (res.rowCount === 0) {
        summary.skipped_existing++;
        console.log(`exists, left untouched: ${row.profile} -> ${patientId}`);
      } else if (res.rows[0].inserted) {
        summary.inserted++;
        console.log(`inserted: ${row.profile} -> ${patientId} (rev ${revision})`);
      } else {
        summary.updated++;
        console.log(`updated (--force): ${row.profile} -> ${patientId} (rev ${revision})`);
      }
    }

    if (dryRun) {
      await client.query("ROLLBACK");
      console.log("dry-run: rolled back");
    } else {
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  console.log(JSON.stringify({ tenant, dryRun, ...summary }));
} finally {
  await pool.end();
}
