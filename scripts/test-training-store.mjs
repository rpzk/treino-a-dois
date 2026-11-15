import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is required, e.g. postgres://postgres:test@127.0.0.1:54329/fitcore_test",
  );
  process.exit(2);
}

const store = await import("../lib/training-store.ts");
const { getProfileState, saveProfileState, provisionProfile, closeTrainingStore } = store;

const run = randomUUID().slice(0, 8);
const fhir = `patient-${run}`;
const tenantA = `tenant_a_${run}`;
const tenantB = `tenant_b_${run}`;

const keyA = { tenantSchema: tenantA, patientFhirId: fhir };
const keyB = { tenantSchema: tenantB, patientFhirId: fhir };

try {
  // Unknown profile
  assert.equal(await getProfileState(keyA), null, "unknown profile -> null");

  // Same patient_fhir_id, different tenant -> two distinct profiles
  const a = await provisionProfile({ ...keyA, displayName: "Alice" });
  const b = await provisionProfile({ ...keyB, displayName: "Bob" });
  assert.equal(a.created, true);
  assert.equal(b.created, true);
  assert.notEqual(a.profileId, b.profileId, "tenants are isolated");

  // Idempotent provisioning (same key)
  const again = await provisionProfile({ ...keyA, displayName: "Ignored" });
  assert.equal(again.created, false);
  assert.equal(again.profileId, a.profileId);

  const pa = await getProfileState(keyA);
  const pb = await getProfileState(keyB);
  assert.ok(pa && pb, "both profiles exist");
  assert.equal(pa.id, a.profileId);
  assert.equal(pa.displayName, "Alice");
  assert.equal(pb.displayName, "Bob");
  assert.equal(pa.revision, 0);
  assert.deepEqual(pa.state, { workouts: [], sessions: [], active: null, timer: null });

  // Save with correct revision
  const item = { id: "e1", name: "Supino", group: "Peito", sets: 3, reps: 10, rest: 90 };
  const next = {
    workouts: [{ id: "w1", name: "Treino A", items: [item] }],
    sessions: [],
    active: null,
    timer: null,
  };
  const saved = await saveProfileState(keyA, next, 0);
  assert.deepEqual(saved, { revision: 1 });

  const reloaded = await getProfileState(keyA);
  assert.equal(reloaded.revision, 1);
  assert.deepEqual(reloaded.state, next, "state round-trips through jsonb");

  // Optimistic lock: stale revision -> conflict, no overwrite
  const stale = await saveProfileState(keyA, { ...next, workouts: [] }, 0);
  assert.deepEqual(stale, { conflict: true });
  const afterConflict = await getProfileState(keyA);
  assert.equal(afterConflict.revision, 1);
  assert.equal(afterConflict.state.workouts.length, 1, "conflict does not overwrite");

  // Wrong (future) revision also conflicts
  assert.deepEqual(await saveProfileState(keyA, next, 5), { conflict: true });

  // Second tenant is untouched
  const untouched = await getProfileState(keyB);
  assert.equal(untouched.revision, 0);
  assert.equal(untouched.state.workouts.length, 0, "tenant B unaffected");

  // Saving to an unknown profile -> conflict (no implicit create)
  const ghost = await saveProfileState(
    { tenantSchema: tenantA, patientFhirId: `ghost-${run}` },
    next,
    0,
  );
  assert.deepEqual(ghost, { conflict: true });

  // Invalid state is rejected by schema validation
  await assert.rejects(() => saveProfileState(keyA, { workouts: "nope" }, 1));

  // Sequential increments
  assert.deepEqual(await saveProfileState(keyA, next, 1), { revision: 2 });

  // Concurrent writers with same expected revision: exactly one wins
  const results = await Promise.all([
    saveProfileState(keyA, next, 2),
    saveProfileState(keyA, next, 2),
    saveProfileState(keyA, next, 2),
  ]);
  assert.equal(results.filter((r) => "revision" in r).length, 1, "single concurrent winner");
  assert.equal(results.filter((r) => "conflict" in r).length, 2);

  console.log("training-store: all assertions passed");
} finally {
  await closeTrainingStore();
}
