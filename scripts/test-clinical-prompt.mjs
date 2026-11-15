import assert from "node:assert/strict";
import {
  applyHealthMode,
  BANNED_BRAND_PATTERN,
  fetchClinicalContext,
  HEALTH_SYSTEM_FRAGMENT,
  normalizeClinicalContext,
} from "../lib/clinical-context.ts";
import { buildCoachSystem } from "../lib/session-coach.ts";
import { buildSuggestSystem } from "../lib/workout-suggest.ts";

const raw = {
  consented: true,
  age_years: 42,
  sex: "female",
  conditions: [
    { description: "Hipertensão essencial", clinical_status: "active" },
    { description: "Protocolo ProSer fase 2", clinical_status: "active" },
    { description: "Uronal", clinical_status: "active" },
  ],
};
const ctx = normalizeClinicalContext(raw);
assert.equal(ctx.consented, true);
assert.equal(ctx.age_years, 42);
assert.equal(ctx.conditions.length, 1, "condições com marca são descartadas");

// Sem TCLE: prompts genéricos idênticos, sem fragmento de saúde.
for (const build of [buildSuggestSystem, buildCoachSystem]) {
  const generic = build(null);
  assert.equal(build(undefined), generic);
  assert.equal(build({ consented: false, conditions: [] }), generic);
  assert.ok(!generic.includes("para saúde"));
  assert.ok(!generic.includes("Hipertensão"));

  const health = build(ctx);
  assert.ok(health.includes(HEALTH_SYSTEM_FRAGMENT));
  assert.match(health, /saúde/);
  assert.match(health, /Hipertensão essencial \(active\)/);
  assert.match(health, /42 anos/);
  assert.ok(!BANNED_BRAND_PATTERN.test(health), "prompt sem marcas");
  assert.ok(!/proser|uronal/i.test(health));
}
assert.equal(applyHealthMode("base", null), "base");
assert.ok(!/proser|uronal/i.test(HEALTH_SYSTEM_FRAGMENT));

// Nunca persistir/expor: normalização de payload inválido
assert.equal(normalizeClinicalContext(null), null);
assert.deepEqual(normalizeClinicalContext({ consented: false, conditions: [{ description: "x" }] }), {
  consented: false,
  conditions: [],
});

// fetch helper: URL/header e fallback em falha
let seen;
const ok = await fetchClinicalContext({
  issuer: "http://hc.example/",
  secret: "s3cret",
  tenantSchema: "t1",
  patientFhirId: "Patient/1",
  fetchImpl: async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify(raw), { status: 200 });
  },
});
assert.equal(ok.consented, true);
assert.match(seen.url, /^https:\/\/hc\.example\/api\/v1\/internal\/fitcore\/clinical-context\/\?/);
assert.match(seen.url, /patient_fhir_id=Patient%2F1/);
assert.match(seen.url, /tenant_schema=t1/);
assert.equal(seen.init.headers["X-FitCore-Exchange-Secret"], "s3cret");
const fail = await fetchClinicalContext({
  issuer: "https://hc.example",
  secret: "x",
  tenantSchema: "t1",
  patientFhirId: "p",
  fetchImpl: async () => new Response("no", { status: 500 }),
});
assert.equal(fail, null);
const boom = await fetchClinicalContext({
  issuer: "https://hc.example",
  secret: "x",
  tenantSchema: "t1",
  patientFhirId: "p",
  fetchImpl: async () => {
    throw new Error("net");
  },
});
assert.equal(boom, null);

console.log("clinical prompt tests ok");
