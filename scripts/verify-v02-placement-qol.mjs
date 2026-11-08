import assert from "node:assert/strict";
import { roadLine } from "../web/v02/weekend/placement-helpers.js";
import {
  createSandbox,
  plan,
  planRoadLine,
  save,
  restore,
} from "../web/v02/weekend/simulation.js";
assert.deepEqual(roadLine({ x: 3, z: 2 }, { x: 1, z: 2 }), [
  { x: 3, z: 2 },
  { x: 2, z: 2 },
  { x: 1, z: 2 },
]);
assert.equal(roadLine({ x: 1, z: 1 }, { x: 2, z: 2 }), null);
assert.equal(roadLine({ x: 1, z: 3 }, { x: 1, z: 1 }).length, 3);
const s = createSandbox(42);
assert.equal(plan(s, "road", 50, 50), "");
assert.equal(planRoadLine(s, { x: 50, z: 50 }, { x: 54, z: 50 }), "");
assert.equal(s.projects.filter((p) => p.key === "road").length, 5);
assert.ok(restore(save(s)));
assert.equal(plan(s, "road", 57, 50), "");
const before = JSON.stringify(s);
assert.ok(planRoadLine(s, { x: 50, z: 50 }, { x: 51, z: 51 }));
assert.equal(JSON.stringify(s), before);
assert.equal(plan(s, "house", 60, 50), "");
const blocked = JSON.stringify(s);
assert.ok(planRoadLine(s, { x: 58, z: 50 }, { x: 62, z: 50 }));
assert.equal(
  JSON.stringify(s),
  blocked,
  "blocked line rolls back earlier tiles",
);
const poor = createSandbox(42);
poor.mode = "story";
poor.materials.stone = 1;
poor.materials.earth = 1;
const empty = JSON.stringify(poor);
assert.ok(planRoadLine(poor, { x: 50, z: 50 }, { x: 54, z: 50 }));
assert.equal(
  JSON.stringify(poor),
  empty,
  "insufficient materials roll back entire batch",
);
console.log(
  "PASS: road directions, existing anchors, persistence, blocked and unaffordable batch rollback",
);
