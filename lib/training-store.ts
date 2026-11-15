import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { profiles } from "../db/pg-schema.ts";
import { blank, stateSchema, type State } from "./training.ts";

export type ProfileKey = {
  tenantSchema: string;
  patientFhirId: string;
};

export type StoredProfile = {
  id: string; // uuid
  tenantSchema: string;
  patientFhirId: string;
  displayName: string | null;
  revision: number;
  state: State;
};

/** Keep in sync with drizzle/pg/0000_fitcore_profiles.sql. */
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

// Arbitrary constant: serialises concurrent boots so CREATE ... IF NOT EXISTS cannot race.
const BOOTSTRAP_LOCK_KEY = 704110501;

let pool: Pool | null = null;
let db: NodePgDatabase | null = null;
let ready: Promise<NodePgDatabase> | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

async function bootstrap(p: Pool): Promise<void> {
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [BOOTSTRAP_LOCK_KEY]);
    try {
      await client.query(BOOTSTRAP_SQL);
    } catch (error) {
      // DML-only roles (e.g. fitcore_app) cannot CREATE SCHEMA/TABLE.
      // If the schema was provisioned by migrations/superuser, continue.
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code !== "42501") throw error;
      await client.query("SELECT 1 FROM fitcore.profiles LIMIT 0");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function database(): Promise<NodePgDatabase> {
  if (ready) return ready;
  const p = new Pool({ connectionString: connectionString(), max: 5 });
  pool = p;
  ready = bootstrap(p).then(() => {
    db = drizzle(p);
    return db;
  });
  // A failed boot must not poison the process: allow a retry on next call.
  ready.catch(() => {
    ready = null;
    pool = null;
    void p.end().catch(() => undefined);
  });
  return ready;
}

/** Close the pool (tests / graceful shutdown). */
export async function closeTrainingStore(): Promise<void> {
  const p = pool;
  pool = null;
  db = null;
  ready = null;
  if (p) await p.end();
}

function toStored(row: typeof profiles.$inferSelect): StoredProfile {
  return {
    id: row.id,
    tenantSchema: row.tenantSchema,
    patientFhirId: row.patientFhirId,
    displayName: row.displayName,
    revision: row.revision,
    state: stateSchema.parse(row.state),
  };
}

export async function getProfileState(
  key: ProfileKey,
): Promise<StoredProfile | null> {
  const d = await database();
  const [row] = await d
    .select()
    .from(profiles)
    .where(
      and(
        eq(profiles.tenantSchema, key.tenantSchema),
        eq(profiles.patientFhirId, key.patientFhirId),
      ),
    )
    .limit(1);
  return row ? toStored(row) : null;
}

/**
 * Compare-and-swap on `revision`. Returns `{ conflict: true }` when the stored
 * revision differs from `expectedRevision` or the profile does not exist.
 */
export async function saveProfileState(
  key: ProfileKey,
  state: State,
  expectedRevision: number,
): Promise<{ revision: number } | { conflict: true }> {
  const parsed = stateSchema.parse(state);
  const d = await database();
  const [row] = await d
    .update(profiles)
    .set({
      state: parsed,
      revision: sql`${profiles.revision} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(profiles.tenantSchema, key.tenantSchema),
        eq(profiles.patientFhirId, key.patientFhirId),
        eq(profiles.revision, expectedRevision),
      ),
    )
    .returning({ revision: profiles.revision });
  return row ? { revision: row.revision } : { conflict: true };
}

/** Idempotent: returns the existing profile when the (tenant, patient) key exists. */
export async function provisionProfile(input: {
  tenantSchema: string;
  patientFhirId: string;
  displayName?: string | null;
}): Promise<{ profileId: string; created: boolean }> {
  const d = await database();
  const [inserted] = await d
    .insert(profiles)
    .values({
      tenantSchema: input.tenantSchema,
      patientFhirId: input.patientFhirId,
      displayName: input.displayName ?? null,
      state: blank,
    })
    .onConflictDoNothing({
      target: [profiles.tenantSchema, profiles.patientFhirId],
    })
    .returning({ id: profiles.id });
  if (inserted) return { profileId: inserted.id, created: true };

  const [existing] = await d
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.tenantSchema, input.tenantSchema),
        eq(profiles.patientFhirId, input.patientFhirId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("provisionProfile: profile vanished after conflict");
  // Parity with SQLite: a non-empty display name refreshes the stored one.
  if (input.displayName) {
    await d
      .update(profiles)
      .set({ displayName: input.displayName })
      .where(eq(profiles.id, existing.id));
  }
  return { profileId: existing.id, created: false };
}
