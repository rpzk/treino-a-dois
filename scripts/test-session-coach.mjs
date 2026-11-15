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

// Hardening (M3)
assert.throws(() => parseSessionCoachTip("null"), /JSON/);
assert.throws(() => parseSessionCoachTip("[]"), /JSON/);
assert.throws(() => parseSessionCoachTip('"texto"'), /JSON/);
assert.throws(() => parseSessionCoachTip("42"), /JSON/);
assert.throws(() => parseSessionCoachTip(""), /JSON/);
assert.throws(
  () => parseSessionCoachTip("{bad}"),
  (err) => err instanceof Error && !(err instanceof SyntaxError) && /JSON/.test(err.message),
);
assert.throws(
  () => parseSessionCoachTip("texto {bad json} fim"),
  (err) => err instanceof Error && !(err instanceof SyntaxError) && /JSON/.test(err.message),
);
assert.throws(() => parseSessionCoachTip('{"tip_technique":{"x":1}}'), /técnica/);
assert.throws(() => parseSessionCoachTip('{"tip_technique":123}'), /técnica/);
assert.throws(() => parseSessionCoachTip('{"tip_technique":["a"]}'), /técnica/);
assert.equal(
  parseSessionCoachTip('{"tip_technique":"Ok.","tip_progression":0}').tip_progression,
  null,
);
assert.equal(
  parseSessionCoachTip('{"tip_technique":"Ok.","tip_progression":{"a":1}}').tip_progression,
  null,
);
assert.equal(
  parseSessionCoachTip('Aqui: {"tip_technique":"Prosa ao redor."} ok').tip_technique,
  "Prosa ao redor.",
);
assert.equal(
  parseSessionCoachTip('```json\n{"tip_technique":"Cerca."}\n```').tip_technique,
  "Cerca.",
);

console.log("session-coach parse checks passed");
