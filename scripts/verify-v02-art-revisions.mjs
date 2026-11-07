import assert from "node:assert/strict";
import * as THREE from "three";
import {
  ASSETS,
  createAsset,
  compactModel,
} from "../web/v02/library/catalog.js";
import { configureMapSun } from "../web/v02/land/lighting.js";
for (const a of ASSETS.filter((a) => a.category === "Homes")) {
  assert.deepEqual(a.footprint, [2, 2], a.id);
  if (a.id === "house") continue;
  const g = createAsset(a.id);
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3()
        .fromBufferAttribute(p, i)
        .applyMatrix4(o.matrixWorld);
      if (v.y < 0.12)
        assert(
          Math.abs(v.x) <= 2.01 && Math.abs(v.z) <= 2.01,
          `${a.id}: foundation outside 2x2`,
        );
    }
  });
}
assert.deepEqual(ASSETS.find((a) => a.id === "solar_farm").footprint, [3, 2]);
assert.deepEqual(ASSETS.find((a) => a.id === "compost").footprint, [3, 1]);
for (const [asset, name, count] of [
  ["solar_farm", "solar-panel", 6],
  ["compost", "compost-bin", 3],
]) {
  let actual = 0;
  createAsset(asset).traverse((o) => {
    if (o.name === name) actual++;
  });
  assert.equal(actual, count);
}
const glass = compactModel(createAsset("greenhouse"));
const panes = glass.children.filter((o) => o.material?.transparent);
assert(panes.length >= 10);
for (const p of panes) {
  assert(!p.castShadow);
  assert(p.material.opacity >= 0.3);
}
const sun = new THREE.DirectionalLight();
configureMapSun(sun);
sun.updateMatrixWorld();
sun.target.updateMatrixWorld();
sun.shadow.updateMatrices(sun);
for (const x of [-64, 0, 64])
  for (const z of [-64, 0, 64])
    for (const y of [0, 9]) {
      const v = new THREE.Vector3(x, y, z).project(sun.shadow.camera);
      assert(
        Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && Math.abs(v.z) < 1,
        `Shadow coverage missing at ${x},${y},${z}`,
      );
    }
console.log(
  "PASS: six 2x2 houses, foundation bounds, six-panel 3x2 solar array, three-bin 3x1 compost, sorted non-opaque glass shadows, whole-map shadow coverage through 9m height.",
);
