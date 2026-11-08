import assert from "node:assert/strict";
import {
  createSandbox,
  supplyRun,
  tick,
  save,
  restore,
  MATERIALS,
} from "../web/v02/weekend/simulation.js";
import { townCarPose } from "../web/v02/weekend/town-trip.js";
const s = createSandbox(42);
s.money = 3000;
const wood = s.wood;
assert.ok(supplyRun(s, "wood"));
assert.equal(s.trip.phase, "boarding");
const seen = new Set();
let escaped = false;
for (let i = 0; i < 2500 && s.trip; i++) {
  const trip = s.trip;
  seen.add(trip.phase);
  const pose = townCarPose(trip, trip.vehicle);
  if (pose.z < -128) escaped = true;
  assert.equal(s.wood, wood, "no supplies before unloading");
  if (!seen.has(`${trip.phase}-save`)) {
    const loaded = restore(save(s));
    assert.ok(loaded, trip.phase + " restores");
    assert.equal(loaded.trip.phase, trip.phase);
    for (let j = 0; j < 2500 && loaded.trip; j++) tick(loaded, 0.1);
    assert.equal(loaded.trip, null, trip.phase + " resumes to completion");
    assert.equal(
      loaded.wood,
      wood + MATERIALS.wood.quantity,
      "reload delivers once",
    );
    seen.add(`${trip.phase}-save`);
  }
  tick(s, 0.1);
}
assert.equal(s.trip, null, "trip completes");
for (const phase of ["boarding", "outbound", "away", "inbound", "unloading"])
  assert.ok(seen.has(phase), phase);
assert.ok(escaped, "car crosses plot edge");
assert.equal(s.wood, wood + MATERIALS.wood.quantity);
assert.ok(supplyRun(s, "wood"));
assert.equal(s.trip.vehicle, 1, "second Jimny takes next trip");
console.log(
  "PASS: walk, outbound drive, off-map stay, return, unload, all phase saves, one-time delivery and alternating cars.",
);
