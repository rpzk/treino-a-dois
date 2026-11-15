import assert from 'node:assert/strict';
import {register} from 'node:module';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// Route tests run against the SQLite dev fallback (DATABASE_URL must be unset).
delete process.env.DATABASE_URL;
const tmp = mkdtempSync(path.join(tmpdir(), 'prescribe-'));
process.env.SQLITE_PATH = path.join(tmp, 'training.sqlite');

// Resolve the "@/" tsconfig alias so route handlers can be imported under plain node.
const root = new URL('../', import.meta.url);
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    return next(${JSON.stringify(root.href)} + specifier.slice(2) + '.ts', context);
  }
  return next(specifier, context);
}`), import.meta.url);

const {applyPrescription} = await import('../lib/prescribe-workout.ts');
const {stateSchema, blank} = await import('../lib/training.ts');

const practitioner = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const patient = '9b2f6c1e-5a4d-4f0e-8a77-1c2d3e4f5a6b';
const input = (over = {}) => ({
  tenantSchema: 'clinica_rp',
  patientFhirId: patient,
  mode: 'add',
  practitionerFhirId: practitioner,
  practitionerName: 'Dra. Ana',
  workout: {
    name: 'Treino A · força',
    items: [
      {name: '  Agachamento livre ', sets: 4, reps: 8, rest: 120},
      {name: 'supino reto com barra', group: 'Peito', sets: 3, reps: 10, rest: 90, variation: 'pegada fechada'},
    ],
  },
  ...over,
});

const session = {
  id: 's1', workoutId: 'old', name: 'Antigo', started: '2026-11-01T10:00:00.000Z', finished: '2026-11-01T11:00:00.000Z',
  items: [{id: 'i', name: 'Rosca direta', group: 'Bíceps', sets: 1, reps: 10, rest: 60, logs: [{kg: 10, reps: 10, done: true}]}],
};
const oldWorkout = {id: 'old', name: 'Antigo', items: [{id: 'i', name: 'Rosca direta', group: 'Bíceps', sets: 1, reps: 10, rest: 60}]};
const existing = {...blank, workouts: [oldWorkout], workoutOrder: ['old'], sessions: [session]};

// add: appends, preserves everything, sets metadata, canonical names/groups.
{
  const before = structuredClone(existing);
  const {state, workoutId} = applyPrescription(existing, input());
  assert.deepEqual(existing, before, 'input state not mutated');
  assert.equal(state.workouts.length, 2);
  assert.deepEqual(state.workouts[0], oldWorkout);
  const w = state.workouts[1];
  assert.equal(w.id, workoutId);
  assert.equal(w.name, 'Treino A · força');
  assert.equal(w.prescribed_by_practitioner_fhir_id, practitioner);
  assert.equal(w.prescribed_by_name, 'Dra. Ana');
  assert.ok(!Number.isNaN(Date.parse(w.prescribed_at)));
  assert.ok(w.createdAt);
  assert.equal(w.patient_edited_at, undefined);
  assert.deepEqual(w.items.map(i => [i.name, i.group]), [['Agachamento livre', 'Pernas'], ['Supino reto com barra', 'Peito']]);
  assert.equal(new Set(w.items.map(i => i.id)).size, 2, 'item ids unique');
  assert.equal(w.items[1].variation, 'pegada fechada');
  assert.equal(w.items[0].variation, undefined);
  assert.deepEqual(state.workoutOrder, ['old', workoutId]);
  assert.deepEqual(state.sessions, [session]);
  stateSchema.parse(state);
}

// add on a state without workoutOrder builds an order covering existing workouts.
{
  const {state, workoutId} = applyPrescription({...blank, workouts: [oldWorkout]}, input());
  assert.deepEqual(state.workoutOrder, ['old', workoutId]);
}

// replace: clears workouts/order, keeps sessions + active.
{
  const active = {...session, id: 'act', finished: null};
  const {state, workoutId} = applyPrescription({...existing, active}, input({mode: 'replace'}));
  assert.equal(state.workouts.length, 1);
  assert.equal(state.workouts[0].id, workoutId);
  assert.deepEqual(state.workoutOrder, [workoutId]);
  assert.deepEqual(state.sessions, [session], 'sessions preserved');
  assert.deepEqual(state.active, active, 'active session preserved');
  stateSchema.parse(state);
}

// Validation failures.
{
  const bad = (items, msg) => assert.throws(() => applyPrescription(existing, input({workout: {name: 'X', items}})), msg);
  const ok = {name: 'Rosca direta', sets: 3, reps: 10, rest: 60};
  bad([{...ok, name: 'Exercício inexistente'}], /Exercício inexistente/);
  bad([{...ok, name: 'rosca  direta'}], /rosca {2}direta/);
  bad([], /itens/i);
  bad([{...ok, sets: 0}], /sets/i);
  bad([{...ok, reps: 1.5}], /reps/i);
  bad([{...ok, rest: -1}], /rest/i);
  assert.throws(() => applyPrescription(existing, input({workout: {name: '   ', items: [ok]}})), /name|nome/i);
  assert.throws(() => applyPrescription(existing, input({mode: 'merge'})), /mode/i);
  assert.throws(() => applyPrescription(existing, input({practitionerFhirId: 'nope'})), /practitioner/i);
  assert.throws(() => applyPrescription(existing, input({practitionerName: 'x'.repeat(121)})), /practitioner/i);
  // group is only a hint: a wrong group does not reject a known name
  const {state} = applyPrescription(existing, input({workout: {name: 'G', items: [{...ok, group: 'Ombros'}]}}));
  assert.equal(state.workouts.at(-1).items[0].group, 'Bíceps');
}

// Route.
const {POST} = await import('../app/api/internal/workouts/prescribe/route.ts');
const {readTrainingState, provisionProfileForPatient} = await import('../lib/training-db.ts');
const url = 'http://localhost/api/internal/workouts/prescribe';
const secret = 'test-secret';
const body = (over = {}) => ({
  tenant_schema: 'clinica_rp',
  patient_fhir_id: patient,
  mode: 'add',
  practitioner_fhir_id: practitioner,
  practitioner_name: 'Dra. Ana',
  workout: {name: 'Treino A', items: [{exercise_id: 'squat', name: 'Agachamento livre', sets: 3, reps: 10, rest: 90}]},
  ...over,
});
const post = (b, headers = {'x-fitcore-exchange-secret': secret}) =>
  POST(new Request(url, {method: 'POST', headers, body: typeof b === 'string' ? b : JSON.stringify(b)}));

const prev = process.env.FITCORE_EXCHANGE_SECRET;
try {
  delete process.env.FITCORE_EXCHANGE_SECRET;
  assert.equal((await post(body())).status, 403, 'unconfigured secret rejects');
  process.env.FITCORE_EXCHANGE_SECRET = secret;
  assert.equal((await post(body(), {})).status, 403, 'missing header');
  assert.equal((await post(body(), {'x-fitcore-exchange-secret': 'wrong-secret'})).status, 403, 'wrong secret');
  assert.equal(await readTrainingState({patientFhirId: patient}), null, '403 wrote nothing');

  assert.equal((await post('{nope')).status, 400, 'bad json');
  assert.equal((await post(body({patient_fhir_id: ''}))).status, 400);
  assert.equal((await post(body({patient_fhir_id: 'not-a-uuid'}))).status, 400);
  assert.equal((await post(body({mode: 'merge'}))).status, 400);
  assert.equal((await post(body({practitioner_fhir_id: 'x'}))).status, 400);
  assert.equal((await post(body({tenant_schema: 'Bad Schema!'}))).status, 400);
  assert.equal((await post(body({workout: undefined}))).status, 400);
  assert.equal((await post(body({workout: {name: 'T', items: [{name: 'Nope', sets: 3, reps: 10, rest: 60}]}}))).status, 400, 'unknown exercise');
  assert.equal(await readTrainingState({patientFhirId: patient}), null, 'rejected requests did not provision');

  // First valid call provisions a missing profile and stores the workout.
  const r1 = await post(body());
  assert.equal(r1.status, 200);
  assert.match(r1.headers.get('cache-control') ?? '', /no-store/);
  const j1 = await r1.json();
  assert.equal(j1.ok, true);
  assert.equal(j1.mode, 'add');
  const s1 = await readTrainingState({patientFhirId: patient});
  assert.equal(s1.state.workouts.length, 1);
  assert.equal(s1.state.workouts[0].id, j1.workout_id);
  assert.equal(s1.state.workouts[0].prescribed_by_name, 'Dra. Ana');
  assert.equal(s1.revision, 1);

  // Second add appends; patient id matching is case-insensitive.
  const j2 = await (await post(body({patient_fhir_id: patient.toUpperCase()}))).json();
  const s2 = await readTrainingState({patientFhirId: patient});
  assert.deepEqual(s2.state.workouts.map(w => w.id), [j1.workout_id, j2.workout_id]);
  assert.equal(s2.revision, 2);

  // Replace keeps sessions.
  const {writeTrainingState} = await import('../lib/training-db.ts');
  await writeTrainingState({patientFhirId: patient}, {...s2.state, sessions: [session]}, s2.revision);
  const r3 = await post(body({mode: 'replace'}));
  assert.equal(r3.status, 200);
  const j3 = await r3.json();
  assert.equal(j3.mode, 'replace');
  const s3 = await readTrainingState({patientFhirId: patient});
  assert.deepEqual(s3.state.workouts.map(w => w.id), [j3.workout_id]);
  assert.equal(s3.state.sessions.length, 1, 'replace preserved sessions');

  // Pre-existing provisioned profile is reused (no second row).
  const other = '11111111-2222-4333-8444-555555555555';
  const prov = await provisionProfileForPatient({tenantSchema: '', patientFhirId: other});
  assert.equal(prov.created, true);
  assert.equal((await post(body({patient_fhir_id: other}))).status, 200);
  assert.equal((await readTrainingState({patientFhirId: other})).profile, prov.profile);
} finally {
  if (prev === undefined) delete process.env.FITCORE_EXCHANGE_SECRET; else process.env.FITCORE_EXCHANGE_SECRET = prev;
  rmSync(tmp, {recursive: true, force: true});
}
console.log('prescribe workout tests passed');
