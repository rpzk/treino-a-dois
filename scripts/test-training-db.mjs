// Exercises lib/training-db.ts routing: SQLite when DATABASE_URL is unset,
// Postgres (tenant-keyed) when it is set. Run once per mode:
//   tsx scripts/test-training-db.mjs                      # sqlite
//   DATABASE_URL=postgres://... tsx scripts/test-training-db.mjs  # postgres
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const pg = Boolean(process.env.DATABASE_URL?.trim());
let tmp = null;
if (!pg) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fitcore-sqlite-"));
  process.env.SQLITE_PATH = path.join(tmp, "t.sqlite");
}

const db = await import("../lib/training-db.ts");
const { blank } = await import("../lib/training.ts");

const fhir = randomUUID();
const run = randomUUID().slice(0, 8);
const tenantA = `tenant_a_${run}`;
const tenantB = `tenant_b_${run}`;
const ownerA = { tenantSchema: tenantA, patientFhirId: fhir };
const ownerB = { tenantSchema: tenantB, patientFhirId: fhir };

try {
  assert.equal(db.usePostgresStore(), pg);
  assert.equal(await db.findLinkedProfile(ownerA), null, "unprovisioned -> null");
  assert.equal(await db.readTrainingState(ownerA), null);
  assert.deepEqual(await db.writeTrainingState(ownerA, blank, 0), { notFound: true });

  const expectedProfile = `hc_${fhir.replaceAll("-", "")}`;
  const created = await db.provisionProfileForPatient({
    tenantSchema: tenantA,
    patientFhirId: fhir.toUpperCase(),
    displayName: "Alice",
  });
  assert.equal(created.created, true);
  assert.equal(created.profile, expectedProfile);
  const again = await db.provisionProfileForPatient({
    tenantSchema: tenantA,
    patientFhirId: fhir,
  });
  assert.equal(again.created, false);
  assert.equal(again.display_name, "Alice");

  assert.equal(await db.findLinkedProfile(ownerA), expectedProfile);
  assert.equal(await db.findLinkedDisplayName(ownerA), "Alice");

  const renamed = await db.provisionProfileForPatient({
    tenantSchema: tenantA,
    patientFhirId: fhir,
    displayName: "Alice Souza",
  });
  assert.equal(renamed.created, false);
  assert.equal(renamed.display_name, "Alice Souza");
  assert.equal(await db.findLinkedDisplayName(ownerA), "Alice Souza");

  await assert.rejects(
    db.provisionProfileForPatient({ tenantSchema: tenantA, patientFhirId: "nope" }),
    /inválido/,
  );

  const first = await db.readTrainingState(ownerA);
  assert.equal(first.profile, expectedProfile);
  assert.equal(first.revision, 0);
  assert.deepEqual(first.state, blank);

  const next = { ...blank, planCycleStartedAt: "2026-09-14T15:00:00.000Z" };
  assert.deepEqual(await db.writeTrainingState(ownerA, next, 0), { revision: 1 });
  assert.deepEqual(await db.writeTrainingState(ownerA, next, 0), { conflict: true });
  const after = await db.readTrainingState(ownerA);
  assert.equal(after.revision, 1);
  assert.equal(after.state.planCycleStartedAt, next.planCycleStartedAt);

  if (pg) {
    // Same patient id under another tenant is a different (unprovisioned) profile.
    assert.equal(await db.findLinkedProfile(ownerB), null, "tenant isolation");
    assert.equal(await db.readTrainingState(ownerB), null);
    assert.deepEqual(await db.writeTrainingState(ownerB, next, 0), { notFound: true });
    assert.throws(() => db.database(), /DATABASE_URL/);
    await assert.rejects(
      db.provisionProfileForPatient({ tenantSchema: "", patientFhirId: fhir }),
      /tenant_schema/,
    );
  }

  console.log(`training-db checks passed (${pg ? "postgres" : "sqlite"})`);
} finally {
  if (pg) {
    const { closeTrainingStore } = await import("../lib/training-store.ts");
    await closeTrainingStore();
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
}
