import assert from 'node:assert/strict';
import {register} from 'node:module';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';

// Resolve the "@/" tsconfig alias so the route handler can be imported under plain node.
const root = new URL('../', import.meta.url);
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    return next(${JSON.stringify(root.href)} + specifier.slice(2) + '.ts', context);
  }
  return next(specifier, context);
}`), import.meta.url);

const {stateSchema, workoutSchema, exercises} = await import('../lib/training.ts');

const item = {id: 'exercise', name: 'Supino reto com barra', group: 'Peito', sets: 3, reps: 10, rest: 90};
const base = {id: 'w1', name: 'Treino A', items: [item]};
const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const prescribed = {
  ...base,
  prescribed_by_practitioner_fhir_id: uuid,
  prescribed_by_name: 'Dra. Ana',
  prescribed_at: '2026-11-15T20:00:00.000Z',
  patient_edited_at: '2026-11-16T10:00:00.000Z',
};

// Schema: prescription metadata parses and round-trips; legacy workouts still parse.
assert.deepEqual(workoutSchema.parse(prescribed), prescribed, 'prescription metadata round-trips');
assert.deepEqual(workoutSchema.parse(base), base, 'workout without metadata still parses');
const state = {workouts: [prescribed, base], sessions: [], active: null, timer: null};
assert.deepEqual(stateSchema.parse(state), state, 'state with prescribed workout round-trips');

// Schema: invalid metadata is rejected.
assert.equal(workoutSchema.safeParse({...base, prescribed_by_practitioner_fhir_id: 'not-a-uuid'}).success, false);
assert.equal(workoutSchema.safeParse({...base, prescribed_by_name: 'x'.repeat(121)}).success, false);
assert.equal(workoutSchema.safeParse({...base, prescribed_at: 'yesterday'}).success, false);
assert.equal(workoutSchema.safeParse({...base, patient_edited_at: 'yesterday'}).success, false);

// Route: GET /api/internal/exercises with exchange secret.
const {GET} = await import('../app/api/internal/exercises/route.ts');
const url = 'http://localhost/api/internal/exercises';
const prev = process.env.FITCORE_EXCHANGE_SECRET;
try {
  delete process.env.FITCORE_EXCHANGE_SECRET;
  assert.equal((await GET(new Request(url, {headers: {'x-fitcore-exchange-secret': 'abc'}}))).status, 403, 'unconfigured secret rejects');

  process.env.FITCORE_EXCHANGE_SECRET = 'test-secret';
  assert.equal((await GET(new Request(url))).status, 403, 'missing header rejected');
  assert.equal((await GET(new Request(url, {headers: {'x-fitcore-exchange-secret': 'wrong-secret'}}))).status, 403, 'wrong secret rejected');

  const ok = await GET(new Request(url, {headers: {'x-fitcore-exchange-secret': 'test-secret'}}));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('cache-control') ?? '', /no-store/);
  const body = await ok.json();
  assert.deepEqual(body, {exercises: exercises.map(({name, group}) => ({name, group}))});
  assert.ok(body.exercises.length > 0);
  assert.ok(body.exercises.every(e => typeof e.name === 'string' && typeof e.group === 'string'));
} finally {
  if (prev === undefined) delete process.env.FITCORE_EXCHANGE_SECRET; else process.env.FITCORE_EXCHANGE_SECRET = prev;
}
console.log('prescribe schema + exercises route tests passed');
