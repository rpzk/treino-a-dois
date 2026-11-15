import assert from "node:assert/strict";
import { parseSessionCoachTip } from "../lib/session-coach.ts";

const ok = parseSessionCoachTip(
  '{"tip_technique":"Escápulas retraídas.","tip_progression":"Suba 2,5 kg se as reps saírem limpas."}',
);
assert.equal(ok.tip_technique, "Escápulas retraídas.");
assert.equal(ok.tip_progression, "Suba 2,5 kg se as reps saírem limpas.");

const nullProg = parseSessionCoachTip(
  '{"tip_technique":"Cotovelos a ~45°.","tip_progression":null}',
);
assert.equal(nullProg.tip_progression, null);

const emptyProg = parseSessionCoachTip(
  '{"tip_technique":"Desça controlado.","tip_progression":""}',
);
assert.equal(emptyProg.tip_progression, null);

assert.throws(() => parseSessionCoachTip("{}"), /técnica/);
assert.throws(() => parseSessionCoachTip("not json"), /JSON/);

console.log("session-coach parse checks passed");