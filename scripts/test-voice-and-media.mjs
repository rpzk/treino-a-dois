import assert from "node:assert/strict";
import { parseVoiceCommand } from "../lib/voice-commands.ts";
import { resolveExerciseMedia, extractMachineLabel } from "../lib/exercise-media.ts";

// --- Voice command parser ---
assert.deepEqual(parseVoiceCommand("feita"), { type: "complete_set" });
assert.deepEqual(parseVoiceCommand("Pronto!"), { type: "complete_set" });
assert.deepEqual(parseVoiceCommand("feita 45 quilos 12 reps"), {
  type: "complete_set",
  kg: 45,
  reps: 12,
});
assert.deepEqual(parseVoiceCommand("fiz doze com quarenta e cinco quilos"), {
  type: "complete_set",
  kg: 45,
  reps: 12,
});
assert.deepEqual(parseVoiceCommand("42,5 kg 10 repetições"), {
  type: "complete_set",
  kg: 42.5,
  reps: 10,
});
assert.deepEqual(parseVoiceCommand("peso 35"), {
  type: "set_load",
  kg: 35,
});
assert.deepEqual(parseVoiceCommand("aumenta 2 e meio quilos"), {
  type: "set_load",
  deltaKg: 2.5,
});
assert.deepEqual(parseVoiceCommand("diminui 5 quilos"), {
  type: "set_load",
  deltaKg: -5,
});
assert.deepEqual(parseVoiceCommand("15 reps"), {
  type: "set_reps",
  reps: 15,
});
assert.deepEqual(parseVoiceCommand("pular descanso"), { type: "skip_rest" });
assert.deepEqual(parseVoiceCommand("mais 30 segundos"), {
  type: "add_rest",
  seconds: 30,
});
assert.deepEqual(parseVoiceCommand("pausar descanso"), { type: "pause_rest" });
assert.deepEqual(parseVoiceCommand("retomar descanso"), { type: "resume_rest" });
assert.deepEqual(parseVoiceCommand("como faz esse exercício"), {
  type: "read_instructions",
});
assert.equal(parseVoiceCommand("bom dia").type, "unknown");

// --- Exercise media resolver ---
const legPress = resolveExerciseMedia(
  "Leg press horizontal",
  "BodyCraft X4 · Estação 3 (Leg press horizontal)",
);
assert.ok(legPress.visual);
assert.equal(legPress.visual.id, "Leg_Press");
assert.equal(legPress.visual.frames.length, 2);
assert.equal(legPress.machineLabel, "BodyCraft X4");
assert.ok(legPress.machineVideoSearchUrl?.includes("BodyCraft+X4"));
assert.ok(legPress.videoSearchUrl.includes("sp=EgIYAQ%3D%3D"));

const trxRow = resolveExerciseMedia("Remada invertida no TRX", "Espaldar + TRX");
assert.equal(trxRow.visual?.id, "Suspended_Row");
assert.equal(trxRow.machineLabel, "Espaldar + TRX");

assert.equal(extractMachineLabel("Halteres"), null);
assert.equal(extractMachineLabel("BodyCraft X4 (Estação 1)"), "BodyCraft X4");

console.log("voice-commands + exercise-media checks passed");
