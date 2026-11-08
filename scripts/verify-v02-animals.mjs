import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createAsset,
  compactModel,
  disposeModel,
} from "../web/v02/library/catalog.js";
import {
  collectAnimals,
  animateAnimals,
} from "../web/v02/library/animal-motion.js";
for (const [id, count] of [
  ["goat_pasture", 2],
  ["coop", 3],
  ["goat", 1],
  ["hen-0", 1],
]) {
  const root = compactModel(createAsset(id)),
    actors = collectAnimals(root);
  assert.equal(actors.length, count, id);
  const geometries = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
  });
  let moved = false;
  let previous = null;
  for (let n = 0; n < 600; n++) {
    animateAnimals(actors, n / 30);
    root.updateMatrixWorld(true);
    for (const a of actors) {
      assert(Math.abs(a.root.position.x - a.x) <= 0.23);
      assert(Math.abs(a.root.position.z - a.z) <= 0.23);
      assert(Number.isFinite(a.rig.head.rotation.z));
    }
    const angle = actors[0].rig.head.rotation.z + actors[0].rig.head.rotation.x;
    if (previous !== null) {
      assert(Math.abs(angle - previous) < 0.2, "smooth head motion");
      if (Math.abs(angle - previous) > 0.001) moved = true;
    }
    previous = angle;
  }
  assert(moved);
  root.traverse((o) => {
    if (o.geometry)
      assert(
        geometries.has(o.geometry),
        "no geometry allocated during animation",
      );
  });
  const bounds = new THREE.Box3().setFromObject(root, true);
  assert(Number.isFinite(bounds.max.y));
  disposeModel(root);
  console.log(
    `PASS ${id}: ${count} articulated animals, smooth bounded motion and stable geometry.`,
  );
}
