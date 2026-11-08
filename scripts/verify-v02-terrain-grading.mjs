import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createSandbox,
  plan,
  moveProject,
  save,
  restore,
  placementError,
} from "../web/v02/weekend/simulation.js";
import {
  elevationAt,
  footprintRelief,
  foundationPad,
} from "../web/v02/weekend/elevation.js";
import { createTerrain, updateTerrain } from "../web/v02/weekend/terrain.js";
const s = createSandbox(42);
let site;
for (let x = 55; x < 85 && !site; x += 3)
  for (let z = 45; z < 80; z += 3) {
    if (
      footprintRelief(x, z, 2, 2, 42) > 0.22 &&
      !placementError(s, "garden", x, z)
    ) {
      site = { x, z };
      break;
    }
  }
assert.ok(site, "find a previously unbuildable slope");
const before = JSON.stringify(s.terrainPads);
assert.ok(plan(s, "garden", 200, 200));
assert.equal(
  JSON.stringify(s.terrainPads),
  before,
  "failed placement never levels ground",
);
assert.equal(plan(s, "garden", site.x, site.z), "");
assert.ok(footprintRelief(site.x, site.z, 2, 2, 42, s.terrainPads) < 1e-8);
const loaded = restore(save(s));
assert.ok(loaded);
assert.deepEqual(loaded.terrainPads, s.terrainPads);
const mesh = createTerrain(42);
updateTerrain(mesh, 42, s.terrainPads);
mesh.updateMatrixWorld(true);
const ray = new THREE.Raycaster();
for (let x = (site.x - 32) * 2 - 5; x < (site.x - 32) * 2 + 10; x += 0.7) {
  const z = (site.z - 32) * 2 + 0.35;
  ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
  assert.ok(
    Math.abs(
      ray.intersectObject(mesh)[0].point.y -
        elevationAt(x, z, 42, s.terrainPads),
    ) < 1e-5,
    "mesh and feet agree",
  );
}
const pad = s.terrainPads.at(-1);
const adjacent = foundationPad(site.x + 2, site.z, 2, 2, 42, s.terrainPads);
assert.equal(
  adjacent.height,
  pad.height,
  "adjoining pads share their existing elevation",
);
const prior = elevationAt(
  (pad.left + pad.right) / 2,
  (pad.top + pad.bottom) / 2,
  42,
  s.terrainPads,
);
s.terrainPads.push(adjacent);
assert.equal(
  elevationAt(
    (pad.left + pad.right) / 2,
    (pad.top + pad.bottom) / 2,
    42,
    s.terrainPads,
  ),
  prior,
);
const far = 100;
assert.equal(
  elevationAt(far, far, 42, s.terrainPads),
  elevationAt(far, far, 42),
);
const moved = restore(save(s));
assert.equal(moveProject(moved, moved.projects.at(-1).id, site.x + 8, site.z + 8), "");
assert.ok(footprintRelief(site.x + 8, site.z + 8, 2, 2, 42, moved.terrainPads) < 1e-8);
assert.ok(restore(save(moved)), "moved foundations survive reload");
const poor = createSandbox(42);
poor.mode = "story";
poor.wood = 0;
for (const key of Object.keys(poor.materials)) poor.materials[key] = 0;
const untouched = JSON.stringify(poor.terrainPads);
assert.match(plan(poor, "garden", site.x, site.z), /Missing/);
assert.equal(JSON.stringify(poor.terrainPads), untouched);
const invalid = JSON.parse(save(s));
invalid.terrainPads[0].height = 100;
assert.equal(restore(JSON.stringify(invalid)), null);
console.log(
  "PASS: sloped blueprints flatten foundations, adjacent pads retain height, terrain raycasts match walking heights, failed placements do not grade, and pads persist safely.",
);
