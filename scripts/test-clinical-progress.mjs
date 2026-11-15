import assert from "node:assert/strict";
import { buildClinicalProgress } from "../lib/clinical-progress.ts";
import { localDay, weekStart } from "../lib/training-stats.ts";

const today = "2026-11-15"; // Saturday Curitiba calendar day for fixtures
assert.equal(weekStart(today), "2026-11-09");

const empty = buildClinicalProgress({
  linked: false,
  sessions: [],
  activeName: null,
  todayDay: today,
});
assert.deepEqual(empty, {
  linked: false,
  sessions_this_week: 0,
  last_session: null,
  active_workout_name: null,
});

const withData = buildClinicalProgress({
  linked: true,
  sessions: [
    { name: "A", finished: "2026-11-14T21:00:00.000Z" },
    { name: "B", finished: "2026-11-08T21:00:00.000Z" }, // previous week
    { name: "C", finished: null },
  ],
  activeName: "Em andamento",
  todayDay: today,
});
assert.equal(withData.sessions_this_week, 1);
assert.equal(withData.last_session?.name, "A");
assert.equal(withData.active_workout_name, "Em andamento");
console.log("clinical-progress checks passed");