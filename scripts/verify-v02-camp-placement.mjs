import { ROAD_SHIFT } from "../web/v02/weekend/road-layout.js";
import assert from "node:assert/strict";
import {
  createWeekend,
  chooseCamp,
  campPlacementError,
  campLocation,
  restore,
  save,
  tick,
} from "../web/v02/weekend/simulation.js";
for (const seed of [0, 42, 97]) {
  const s = createWeekend(seed);
  s.arrivalElapsed = 17;
  assert.equal(campPlacementError(s, 40, 34), null);
  assert.ok(chooseCamp(s, { x: 40, z: 34 }));
  assert.deepEqual([campLocation(s).x, campLocation(s).z], [40, 34]);
  for (let i = 0; i < 50; i++) tick(s, 0.1);
  const restored = restore(save(s));
  assert.ok(restored);
  assert.equal(campLocation(restored).x, 40);
  assert.ok(campPlacementError(s, 32, 21 - ROAD_SHIFT / 2));
  assert.ok(campPlacementError(s, -40, 30));
}
console.log(
  "PASS: custom camp placement, blocked road/edges, simulation and saved camp coordinates.",
);
