import assert from "node:assert/strict";
import * as THREE from "three";
import { ASSETS } from "../web/v02/library/catalog.js";
import {
  MAP_CELLS,
  MAP_METRES,
  CELL_METRES,
  PLACEMENTS,
  placementPosition,
  worldCell,
  cameraOffset,
} from "../web/v02/land/layout.js";
assert.equal(MAP_CELLS, 96);
assert.equal(MAP_METRES, 192);
assert.equal(MAP_CELLS ** 2, 9216);
for (let row = 0; row < MAP_CELLS; row++)
  for (let column = 0; column < MAP_CELLS; column++) {
    const [x, , z] = placementPosition(column, row, [1, 1]);
    assert.deepEqual(worldCell(x, z), { column, row });
  }
for (const p of [
  [-96.001, 0],
  [96, 0],
  [0, -96.001],
  [0, 96],
])
  assert.equal(worldCell(...p), null);
assert.deepEqual(worldCell(-96, -96), { column: 0, row: 0 });
assert.deepEqual(worldCell(95.999, 95.999), { column: 95, row: 95 });
const present = new Set(),
  occupied = new Set(),
  paths = new Set();
for (const placement of PLACEMENTS) {
  const def = ASSETS.find((a) => a.id === placement.asset);
  assert.ok(def);
  present.add(def.id);
  const [w, d] =
    placement.rotation % 180 ? [...def.footprint].reverse() : def.footprint;
  assert.ok(
    placement.column >= 0 &&
      placement.row >= 0 &&
      placement.column + w <= MAP_CELLS &&
      placement.row + d <= MAP_CELLS,
  );
  assert.ok(
    Math.abs(placement.column - MAP_CELLS / 2) <= 6 && Math.abs(placement.row - MAP_CELLS / 2) <= 6,
    "reference clearing must stay central",
  );
  const point = placementPosition(placement.column, placement.row, [w, d]);
  assert.equal(
    point[0] - (w * CELL_METRES) / 2,
    (placement.column - MAP_CELLS / 2) * CELL_METRES,
  );
  assert.equal(
    point[2] - (d * CELL_METRES) / 2,
    (placement.row - MAP_CELLS / 2) * CELL_METRES,
  );
  if (def.id === "resident") continue;
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++) {
      const key = `${placement.column + dx},${placement.row + dz}`;
      assert.ok(!occupied.has(key), "overlapping footprints");
      occupied.add(key);
      if (def.id === "road") paths.add(key);
    }
}
assert.deepEqual([...present].sort(), ["house","shed","tree","resident","road"].sort());
const reached = new Set(),
  queue = [[...paths][0]];
while (queue.length) {
  const key = queue.pop();
  if (reached.has(key)) continue;
  reached.add(key);
  const [x, z] = key.split(",").map(Number);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const next = `${x + dx},${z + dz}`;
    if (paths.has(next) && !reached.has(next)) queue.push(next);
  }
}
assert.equal(reached.size, paths.size);
for (let bearing = 0; bearing < 4; bearing++) {
  const c = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 600);
  c.position.set(...cameraOffset(bearing));
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  const origin = new THREE.Vector3(0, 0, 0).project(c);
  for (const axis of [
    [2, 0, 0],
    [0, 0, 2],
  ]) {
    const p = new THREE.Vector3(...axis).project(c);
    assert.ok(
      Math.abs(Math.abs((p.y - origin.y) / (p.x - origin.x)) - 0.5) < 1e-10,
      "camera must preserve 2:1 axes",
    );
  }
  const up = new THREE.Vector3(0, 2, 0).project(c);
  assert.ok(Math.abs(up.x - origin.x) < 1e-10);
}
console.log(
  "PASS: 9,216 cell roundtrips, map edges, centered non-overlapping props, connected path and four exact 2:1 camera bearings.",
);
