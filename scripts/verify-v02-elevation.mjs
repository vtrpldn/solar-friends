import assert from "node:assert/strict";
import * as THREE from "three";
import {
  elevationAt,
  elevationVertex,
  footprintRelief,
} from "../web/v02/weekend/elevation.js";
import { createTerrain } from "../web/v02/weekend/terrain.js";
import { riverCenter } from "../web/v02/weekend/river-layout.js";
import { createWeekend, save, restore } from "../web/v02/weekend/simulation.js";
for (let seed = 1; seed <= 30; seed++) {
  let high = 0;
  for (let x = -60; x <= 60; x += 4)
    for (let z = -60; z <= 60; z += 4)
      high = Math.max(high, elevationAt(x, z, seed));
  assert.ok(high > 3);
  for (let z = -60; z <= 60; z += 2)
    assert.equal(elevationAt(riverCenter(z, seed), z, seed), 0);

  assert.equal(restore(save(createWeekend(seed))).elevationSeed, seed);
}
assert.ok(elevationAt(0, 0, 42) > 0, "map center retains natural elevation");
const terrain = createTerrain(42);
terrain.updateMatrixWorld(true);
const ray = new THREE.Raycaster();
for (const [x, z] of [
  [40.3, 33.7],
  [-48.4, 26.3],
  [20.3, 50.7],
]) {
  ray.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(terrain)[0];
  assert.ok(hit);
  assert.ok(Math.abs(hit.point.y - elevationAt(x, z, 42)) < 1e-5);
}
const old = createWeekend(42);
delete old.elevationSeed;
assert.equal(restore(save(old)).elevationSeed, 0);
assert.ok(footprintRelief(30, 30, 2, 2, 42) > 0, "center is not an artificial flat clearing");
console.log(
  "PASS: seeded hills, natural center and level river, exact terrain triangle sampling and save compatibility.",
);
