import assert from "node:assert/strict";
import * as THREE from "three";
import {
  ASSETS,
  createAsset,
  compactModel,
} from "../web/v02/library/catalog.js";
import { FUNCTIONAL_LAYOUTS } from "../web/v02/library/functional-layouts.js";
import { configureMapSun } from "../web/v02/land/lighting.js";
for (const a of ASSETS.filter((a) => a.category === "Homes")) {
  const [width, depth] = a.footprint;
  const g = createAsset(a.id);
  g.updateMatrixWorld(true);
  assert(g.userData.exteriorOnly, `${a.id}: houses must be exterior-only`);
  const layout=FUNCTIONAL_LAYOUTS[a.id], [w,d]=layout.shell, offset=g.children[0].position;
  g.traverse(o=>{
    if(!o.isMesh)return;
    const b=new THREE.Box3().setFromObject(o,true).translate(offset.clone().negate());
    const interior=b.min.y>.17&&b.max.y<2.8&&b.min.x>-w/2+.25&&b.max.x<w/2-.25&&b.min.z>-d/2+.25&&b.max.z<d/2-.25;
    assert(!interior,`${a.id}: unexpected interior mesh`);
    if(o.name==='roof-tile')assert(!o.castShadow,`${a.id}: small tile shadows alias on walls`);
  });
  g.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3()
        .fromBufferAttribute(p, i)
        .applyMatrix4(o.matrixWorld);
      if (v.y < 0.12)
        assert(
          Math.abs(v.x) <= width + 0.01 && Math.abs(v.z) <= depth + 0.01,
          `${a.id}: foundation outside declared footprint`,
        );
    }
  });
}
assert.deepEqual(ASSETS.find((a) => a.id === "solar_farm").footprint, [4, 4]);
assert.deepEqual(ASSETS.find((a) => a.id === "compost").footprint, [3, 2]);
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
// Material batching must not re-enable decorative shadows or lose receivers.
const source=new THREE.Group(),material=new THREE.MeshStandardMaterial();
for(const [cast,receive] of [[true,true],[false,true],[true,false]]){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);
  mesh.castShadow=cast;mesh.receiveShadow=receive;source.add(mesh);
}
const batched=compactModel(source);
assert.deepEqual(batched.children.map(m=>[m.castShadow,m.receiveShadow]),[[true,true],[false,true],[true,false]]);
const glass = compactModel(createAsset("greenhouse"));
const panes = glass.children.filter((o) => o.material?.transparent);
assert(panes.length >= 8);
for (const p of panes) {
  assert(!p.castShadow);
  assert(p.material.opacity >= 0.15 && p.material.opacity <= 0.4);
}
const sun = new THREE.DirectionalLight();
configureMapSun(sun);
sun.updateMatrixWorld();
sun.target.updateMatrixWorld();
sun.shadow.updateMatrices(sun);
for (const x of [-96, 0, 96])
  for (const z of [-96, 0, 96])
    for (const y of [0, 9]) {
      const v = new THREE.Vector3(x, y, z).project(sun.shadow.camera);
      assert(
        Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && Math.abs(v.z) < 1,
        `Shadow coverage missing at ${x},${y},${z}`,
      );
    }
console.log(
  "PASS: all house sizes, foundation bounds, six-panel 4x4 solar site, three-bin 3x2 compost site, sorted non-opaque glass shadows, whole-map shadow coverage through 9m height.",
);
