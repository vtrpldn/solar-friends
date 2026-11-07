import assert from "node:assert/strict";
import * as THREE from "three";
import {
  ASSETS,
  createAsset,
  disposeModel,
  CELL,
} from "../web/v02/workshop/models.js";
const camera = new THREE.OrthographicCamera(
  -512 / 48 / 2,
  512 / 48 / 2,
  384 / 48,
  -128 / 48,
  0.1,
  100,
);
camera.position.set(12, Math.sqrt(2 / 3) * 12, 12);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const project = (p) => {
  const v = new THREE.Vector3(...p).project(camera);
  return [(v.x + 1) * 256, (1 - v.y) * 256];
};
const origin = project([0, 0, 0]);
assert.deepEqual(origin.map(Math.round), [256, 384]);
for (const p of [
  [CELL, 0, 0],
  [0, 0, CELL],
]) {
  const v = project(p);
  assert.ok(
    Math.abs(Math.abs((v[1] - origin[1]) / (v[0] - origin[0])) - 0.5) < 1e-10,
  );
}
const up = project([0, 1, 0]);
assert.ok(Math.abs(up[0] - origin[0]) < 1e-10);
let frames = 0;
for (const def of ASSETS) {
  const model = createAsset(def.id);
  const roundtrip = new THREE.ObjectLoader().parse(model.toJSON());
  const originalBounds = new THREE.Box3().setFromObject(model),
    loadedBounds = new THREE.Box3().setFromObject(roundtrip);
  assert.ok(originalBounds.min.distanceTo(loadedBounds.min) < 1e-5);
  assert.ok(originalBounds.max.distanceTo(loadedBounds.max) < 1e-5);
  assert.ok(originalBounds.min.y >= -0.001, `${def.id} sinks below ground`);
  for (let i = 0; i < 4; i++) {
    model.rotation.y = (i * Math.PI) / 2;
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const attr = o.geometry.attributes.position;
      for (let j = 0; j < attr.count; j++) {
        const p = new THREE.Vector3()
          .fromBufferAttribute(attr, j)
          .applyMatrix4(o.matrixWorld)
          .project(camera);
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        assert.ok(
          Math.abs(p.x) < 0.96 && Math.abs(p.y) < 0.96,
          `${def.id} rotation ${i * 90} clips export`,
        );
      }
    });
    frames++;
  }
  if (def.id === "road") {
    const b = originalBounds.getSize(new THREE.Vector3());
    assert.equal(b.x, CELL);
    assert.equal(b.z, CELL);
  }
  if (def.id === "shed") {
    const b = originalBounds.getSize(new THREE.Vector3());
    assert.ok(b.x > b.z * 1.8);
    model.rotation.y = Math.PI / 2;
    const rotated = new THREE.Box3()
      .setFromObject(model)
      .getSize(new THREE.Vector3());
    assert.ok(Math.abs(b.x - rotated.z) < 1e-6);
  }
  disposeModel(model);
  disposeModel(roundtrip);
}
console.log(
  `PASS: ${ASSETS.length} model roundtrips, ${frames} unclipped rotation geometries, exact 2:1 ground projection, shared origin, road edges and rotated shed dimensions.`,
);
