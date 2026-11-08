import assert from "node:assert/strict";
import {
  createSandbox,
  createWeekend,
  plan,
  PROJECTS,
  save,
  restore,
  tick,
  canFinish,
} from "../web/v02/weekend/simulation.js";
import { saveKey } from "../web/v02/weekend/modes.js";
const s = createSandbox();
assert.equal(s.stage, "playing");
assert(!s.opening);
assert(!canFinish(s));
assert.notEqual(saveKey("story"), saveKey("sandbox"));
const wood = s.wood;
assert.equal(plan(s, "shelter", 34, 39), "");
assert.equal(s.wood, wood);
assert.equal(s.projects[0].work, PROJECTS.shelter.work);
s.instantBuild = false;
assert.equal(plan(s, "gathering", 29, 35), "");
assert.equal(s.projects[1].work, 0);
for (let i = 0; i < 6000; i++) tick(s, 0.1);
assert.equal(s.projects[1].work, PROJECTS.gathering.work);
assert(!canFinish(s));
const loaded = restore(save(s));
assert(loaded);
assert.equal(loaded.mode, "sandbox");
assert.equal(loaded.instantBuild, false);
assert(createWeekend().opening);
assert.equal(createWeekend().money, 220);
console.log(
  "PASS separate slots, free instant builds, resident construction, sandbox persistence and story defaults.",
);
assert.equal(plan(s, "gathering", 40, 39), "");
assert(restore(save(s)), "duplicate sandbox starter buildings restore");
