import assert from "node:assert/strict";

// Ensure FitCore AI path never depends on provider keys.
delete process.env.OPENAI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
process.env.FITCORE_EXCHANGE_SECRET = "test-fitcore-exchange-secret-part3";
process.env.HEALTHCORE_PUBLIC_URL = "http://rp.rphealthtech.com/";
delete process.env.HEALTHCORE_AI_COMPLETE_PATH;
delete process.env.HEALTHCORE_AI_VISION_PATH;

const {
  DEFAULT_AI_COMPLETE_PATH,
  DEFAULT_AI_VISION_PATH,
  PLAN_AI_ASSIST_PATH,
  assertNoProviderKeysInFitEnv,
  buildAiCompleteUrl,
  buildAiVisionUrl,
  healthcoreAiComplete,
  healthcoreAiVision,
  parseAiCompleteResult,
} = await import("../lib/healthcore-ai.ts");

const {
  parseSuggestedWorkout,
} = await import("../lib/workout-suggest.ts");

assert.equal(DEFAULT_AI_COMPLETE_PATH, "/api/v1/internal/fitcore/ai/complete/");
assert.equal(DEFAULT_AI_VISION_PATH, "/api/v1/internal/fitcore/ai/vision/");
assert.equal(PLAN_AI_ASSIST_PATH, "/api/v1/portal/my-training/ai-assist/");

assert.equal(
  buildAiCompleteUrl("http://rp.rphealthtech.com"),
  "https://rp.rphealthtech.com/api/v1/internal/fitcore/ai/complete/",
);
assert.equal(
  buildAiVisionUrl("https://demo.rphealthtech.com/"),
  "https://demo.rphealthtech.com/api/v1/internal/fitcore/ai/vision/",
);

process.env.HEALTHCORE_AI_COMPLETE_PATH = PLAN_AI_ASSIST_PATH;
assert.equal(
  buildAiCompleteUrl("https://rp.rphealthtech.com"),
  "https://rp.rphealthtech.com/api/v1/portal/my-training/ai-assist/",
);
delete process.env.HEALTHCORE_AI_COMPLETE_PATH;

const parsed = parseAiCompleteResult({
  content: '{"name":"Treino A","items":[]}',
  provider: "groq",
  model: "llama",
  billing_mode: "platform",
  purpose: "fitcore.workout_suggest",
});
assert.equal(parsed.provider, "groq");
assert.equal(parsed.purpose, "fitcore.workout_suggest");
assert.throws(() => parseAiCompleteResult({ provider: "x" }), /content/);
assert.throws(() => parseAiCompleteResult(null), /inválida/);

assertNoProviderKeysInFitEnv();
process.env.OPENAI_API_KEY = "sk-should-never-be-here";
assert.throws(() => assertNoProviderKeysInFitEnv(), /OPENAI_API_KEY/);
delete process.env.OPENAI_API_KEY;

let seenComplete;
await healthcoreAiComplete({
  purpose: "fitcore.workout_suggest",
  tenantSchema: "clinica_rp",
  jsonMode: true,
  messages: [
    { role: "system", content: "sys" },
    { role: "user", content: "Monte um treino" },
  ],
  fetchImpl: async (url, init) => {
    seenComplete = { url: String(url), init };
    return {
      ok: true,
      async json() {
        return {
          content: JSON.stringify({
            name: "Treino Full",
            items: [
              { name: "Supino reto com barra", sets: 3, reps: 10, rest: 90 },
              { name: "Remada curvada", sets: 3, reps: 10, rest: 90 },
              { name: "Agachamento livre", sets: 3, reps: 8, rest: 120 },
              { name: "Desenvolvimento com halteres", sets: 3, reps: 10, rest: 90 },
            ],
          }),
          provider: "groq",
          model: "x",
          billing_mode: "platform",
          purpose: "fitcore.workout_suggest",
        };
      },
    };
  },
});

assert.equal(
  seenComplete.url,
  "https://rp.rphealthtech.com/api/v1/internal/fitcore/ai/complete/",
);
assert.equal(seenComplete.init.method, "POST");
assert.equal(
  seenComplete.init.headers["X-FitCore-Exchange-Secret"],
  "test-fitcore-exchange-secret-part3",
);
const completeBody = JSON.parse(seenComplete.init.body);
assert.equal(completeBody.tenant_schema, "clinica_rp");
assert.equal(completeBody.purpose, "fitcore.workout_suggest");
assert.equal(completeBody.json_mode, true);
assert.equal(completeBody.messages.length, 2);

await assert.rejects(
  () =>
    healthcoreAiComplete({
      purpose: "fitcore.ping",
      tenantSchema: "public",
      messages: [{ role: "user", content: "x" }],
      fetchImpl: async () => {
        throw new Error("should not fetch");
      },
    }),
  /tenant_schema/,
);

let seenVision;
await healthcoreAiVision({
  purpose: "fitcore.equipment_vision",
  tenantSchema: "clinica_rp",
  prompt: "Liste equipamentos",
  images: [{ mime: "image/jpeg", dataBase64: "abc" }],
  fetchImpl: async (url, init) => {
    seenVision = { url: String(url), init };
    return {
      ok: true,
      async json() {
        return {
          content: '{"items":[]}',
          provider: "openai",
          model: "gpt",
          billing_mode: "own_key",
          purpose: "fitcore.equipment_vision",
        };
      },
    };
  },
});
assert.equal(
  seenVision.url,
  "https://rp.rphealthtech.com/api/v1/internal/fitcore/ai/vision/",
);
const visionBody = JSON.parse(seenVision.init.body);
assert.deepEqual(visionBody.images, [{ mime: "image/jpeg", data_base64: "abc" }]);

const suggestion = parseSuggestedWorkout(
  JSON.stringify({
    name: "Treino Full",
    items: [
      { name: "Supino reto com barra", sets: 3, reps: 10, rest: 90 },
      { name: "Remada curvada", sets: 3, reps: 10, rest: 90 },
      { name: "Agachamento livre", sets: 3, reps: 8, rest: 120 },
      { name: "Desenvolvimento com halteres", sets: 3, reps: 10, rest: 90 },
    ],
  }),
);
assert.equal(suggestion.name, "Treino Full");
assert.ok(suggestion.items.length >= 3);

console.log("healthcore-ai contract + suggest parse checks passed");
