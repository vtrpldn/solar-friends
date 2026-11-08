import assert from "node:assert/strict";
import * as THREE from "three";
import { connections } from "../web/v02/land/connections.js";
import {
  createEditor,
  encode,
  decode,
  footprint,
} from "../web/v02/land/editor.js";
import {
  createConnectedAsset,
  compactModel,
} from "../web/v02/library/catalog.js";
const r = (id, x, z, asset = "garden", rotation = 0) => ({
  id,
  asset,
  column: x,
  row: z,
  rotation,
});
assert.equal(connections([r("a", 0, 0)]).size, 0);
assert.equal(
  connections([r("a", 0, 0), r("b", 2, 2)]).size,
  0,
  "Diagonal touch must not merge",
);
assert.equal(
  connections([r("a", 0, 0), r("b", 1, 0)]).size,
  0,
  "Overlapping sections remain independent",
);
assert.equal(
  connections([r("a", 0, 0), r("b", 2, 0, "orchard")]).size,
  0,
  "Different types remain independent",
);
const pair = [r("a", 0, 0), r("b", 2, 0)];
let joined = connections(pair);
assert.equal(joined.get("a").area, 8);
assert.equal(
  [...joined.values()].reduce((s, c) => s + c.edges.length, 0),
  12,
);
const partial = connections([r("a", 0, 0), r("b", 2, 1)]);
assert.equal(
  [...partial.values()].reduce((s, c) => s + c.edges.length, 0),
  14,
  "Only shared edge segment removed",
);
// Exhaust every nonempty 3x3 arrangement, including holes, corners and split groups.
for (let mask = 1; mask < 512; mask++) {
  const records = [];
  for (let i = 0; i < 9; i++)
    if (mask & (1 << i))
      records.push(
        r(`p${i}`, (i % 3) * 2, Math.floor(i / 3) * 2, "garden", (i % 4) * 90),
      );
  const result = connections(records);
  const cells = new Set();
  for (const p of records)
    for (let x = p.column; x < p.column + 2; x++)
      for (let z = p.row; z < p.row + 2; z++) cells.add(`${x},${z}`);
  let expected = 0;
  for (const cell of cells) {
    const [x, z] = cell.split(",").map(Number);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (!cells.has(`${x + dx},${z + dz}`)) expected++;
  }
  let actual = 0;
  for (const p of records) {
    const c = result.get(p.id);
    actual += c ? c.edges.length : 8;
    if (!c) continue;
    const [w, d] = footprint(p),
      a = (p.rotation * Math.PI) / 180;
    for (const edge of c.edges)
      for (const [x, z] of edge) {
        const wx = (Math.cos(a) * x + Math.sin(a) * z) / 2 + p.column + w / 2,
          wz = (-Math.sin(a) * x + Math.cos(a) * z) / 2 + p.row + d / 2;
        assert(Math.abs(wx - Math.round(wx)) < 1e-8);
        assert(Math.abs(wz - Math.round(wz)) < 1e-8);
      }
  }
  assert.equal(actual, expected, `Perimeter for mask ${mask}`);
}
for (const asset of ["garden", "orchard", "solar_farm"])
  for (const rotation of [0, 90, 180, 270]) {
    const a = r("a", 0, 0, asset, rotation),
      [w] = footprint(a),
      b = r("b", w, 0, asset, rotation),
      records = [a, b],
      c = connections(records);
    let panels = 0,
      inverters = 0;
    for (const item of records) {
      const raw = createConnectedAsset(asset, c.get(item.id));
      raw.traverse((o) => {
        if (o.name === "solar-panel") panels++;
        if (o.name === "shared-inverter") inverters++;
      });
      const before = new THREE.Box3().setFromObject(raw, true),
        after = new THREE.Box3().setFromObject(compactModel(raw), true);
      assert(before.min.distanceTo(after.min) < 1e-6);
      assert(before.max.distanceTo(after.max) < 1e-6);
    }
    if (asset === "solar_farm") {
      assert.equal(panels, 12);
      assert.equal(inverters, 1);
    }
    assert.deepEqual(
      [...connections(records)].sort(),
      [...connections([...records].reverse())].sort(),
    );
  }
const mixed = [r("a", 0, 0, "solar_farm"), r("b", 3, 0, "solar_farm", 90)];
assert.equal(connections(mixed).get("a").area, 12);
const editor = createEditor([r("a", 0, 0), r("b", 2, 0), r("c", 4, 0)]);
assert.equal(connections(editor.records).get("a").count, 3);
editor.remove("b");
assert.equal(connections(editor.records).size, 0);
editor.undo();
assert.equal(connections(editor.records).get("c").count, 3);
editor.update("b", { row: 5 });
assert.equal(connections(editor.records).size, 0);
editor.undo();
assert.equal(connections(decode(encode(editor.records))).get("a").count, 3);
console.log(
  "PASS: 511 shape arrangements; shared/partial edges, holes, corners, overlap, mixed types, four rotations, solar cabinets/panels, compaction, move/delete/undo and save reload.",
);
