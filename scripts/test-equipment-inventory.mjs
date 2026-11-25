import assert from "node:assert/strict";
import {
  parseEquipmentVision,
  normalizeEquipmentItems,
} from "../lib/equipment-inventory.ts";
import { blank, stateSchema } from "../lib/training.ts";

const sample = parseEquipmentVision(
  '{"items":[{"label":"Leg press"},{"label":"halteres"},{"label":"  Smith   "}]}',
);
assert.deepEqual(sample, [
  { label: "Leg press" },
  { label: "halteres" },
  { label: "Smith" },
]);

const dedupe = parseEquipmentVision(
  '{"items":[{"label":"Halteres"},{"label":"HALTERES"},{"label":"Barra"}]}',
);
assert.deepEqual(dedupe, [
  { label: "Halteres" },
  { label: "Barra" },
]);

const longLabel = parseEquipmentVision(
  `{"items":[{"label":"${"x".repeat(50)}"}]}`,
);
assert.equal(longLabel[0].label.length, 40);

const cap = normalizeEquipmentItems(
  Array.from({ length: 35 }, (_, i) => ({ label: `Item ${i}` })),
);
assert.equal(cap.length, 30);

assert.deepEqual(normalizeEquipmentItems([]), []);
assert.deepEqual(normalizeEquipmentItems(null), []);
assert.throws(() => parseEquipmentVision('{"items":[]}'), /detectado/);
assert.throws(() => parseEquipmentVision("not json"), /JSON/);
assert.equal(
  parseEquipmentVision('Aqui: {"items":[{"label":"Banco"}]} ok').length,
  1,
);

// Route maps these exact messages to HTTP outcomes (empty → 200, invalid → 422).
const { EMPTY_INVENTORY_MESSAGE, INVALID_JSON_MESSAGE } = await import(
  "../lib/equipment-inventory.ts"
);
try {
  parseEquipmentVision('{"items":[]}');
  assert.fail("expected empty throw");
} catch (error) {
  assert.equal(error instanceof Error && error.message, EMPTY_INVENTORY_MESSAGE);
}
try {
  parseEquipmentVision("not json");
  assert.fail("expected invalid json throw");
} catch (error) {
  assert.equal(error instanceof Error && error.message, INVALID_JSON_MESSAGE);
}

assert.deepEqual(stateSchema.parse(blank), blank);
const legacy = {
  workouts: [],
  sessions: [],
  active: null,
  timer: null,
};
assert.deepEqual(stateSchema.parse(legacy), legacy);

const withInv = {
  ...legacy,
  equipment_inventory: [{ label: "Leg press" }],
};
assert.deepEqual(stateSchema.parse(withInv), withInv);

assert.throws(
  () =>
    stateSchema.parse({
      ...legacy,
      equipment_inventory: [{ label: "" }],
    }),
  /label/i,
);

// Rich multi-station equipment metadata round-trips and merges cleanly.
const richVision = parseEquipmentVision(
  JSON.stringify({
    items: [
      {
        label: "Estação BodyCraft X4",
        brand_model: "BodyCraft X4 (4-Stack Multi-Gym)",
        stations: [
          "Estação 1: Supino / Extensora / Flexora em pé",
          "Estação 2: Puxador alto + braços de cabo",
          "Estação 3: Leg press horizontal",
          "Estação 4: Torre de polia vertical regulável",
        ],
        notes: "Estação compacta 4 torres de condomínio",
      },
      { label: "TRX" },
    ],
  }),
);
assert.equal(richVision.length, 2);
assert.equal(richVision[0].brand_model, "BodyCraft X4 (4-Stack Multi-Gym)");
assert.equal(richVision[0].stations.length, 4);

const { isResearchableMachine, formatInventoryForPrompt } = await import(
  "../lib/equipment-inventory.ts"
);
const { mergeResearchedEquipment } = await import(
  "../lib/equipment-research.ts"
);
assert.equal(isResearchableMachine(richVision[0]), true);
assert.equal(isResearchableMachine({ label: "Colchonete" }), false);

const merged = mergeResearchedEquipment(richVision, [
  {
    label: "Estação BodyCraft X4",
    brand_model: "BodyCraft X4",
    researched_exercises: ["Leg press horizontal", "Puxada frontal", "Face pull"],
  },
]);
assert.deepEqual(merged[0].researched_exercises, [
  "Leg press horizontal",
  "Puxada frontal",
  "Face pull",
]);
assert.equal(merged[0].stations.length, 4);
assert.match(formatInventoryForPrompt(merged), /BodyCraft X4/);
assert.match(formatInventoryForPrompt(merged), /Leg press horizontal/);

const withRichInv = {
  ...legacy,
  equipment_inventory: merged,
};
assert.deepEqual(stateSchema.parse(withRichInv), withRichInv);

console.log("equipment-inventory checks passed");