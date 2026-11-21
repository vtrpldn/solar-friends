import assert from "node:assert/strict";
import * as THREE from "three";
import { paintVillageModel } from "../web/v02/weekend/painted-village.js";
import {
  ASSETS,
  createAsset,
  compactModel,
  disposeModel,
} from "../web/v02/library/catalog.js";
import {
  prepareHouseLighting,
  updateHouseLighting,
  selectBuildingLights,
} from "../web/v02/weekend/house-lighting.js";
function paintedAsset(id) {
  const model = createAsset(id);
  paintVillageModel(model);
  return compactModel(model);
}

for (const def of ASSETS.filter((a) => a.category === "Homes")) {
  const model = paintedAsset(def.id),
    lighting = prepareHouseLighting(model);
  assert.ok(
    lighting.panes.length >= 1,
    def.id + " has illuminated window panes",
  );
  const other = paintedAsset(def.id),
    unlit = prepareHouseLighting(other);
  updateHouseLighting(lighting, 1);
  assert.ok(lighting.panes.every((p) => p.material.emissiveIntensity === 0.85));
  assert.ok(
    unlit.panes.every(
      (p) =>
        p.material.emissiveIntensity === 1 &&
        p.material.emissive.getHex() === 0,
    ),
    "instances retain separate materials",
  );
  updateHouseLighting(lighting, 0);
  assert.ok(
    lighting.panes.every(
      (p) =>
        p.material.emissiveIntensity === 0 && p.material.color.equals(p.color),
    ),
  );
  disposeModel(model);
  disposeModel(other);
}
console.log(
  "PASS: all house variants have isolated window glow and restore their daytime materials when unlit.",
);

for (const id of ["kitchen", "reading-room", "community-hall"]) {
  const model = paintedAsset(id);
  const lighting = prepareHouseLighting(model);
  assert(lighting.panes.length > 0, id + " has lit windows");
  const pane = [...lighting.panes].sort((a,b) => b.center.z-a.center.z)[0];
  const offset = lighting.spill.clone().sub(pane.center);
  assert(Math.abs(offset.length() - .45) < 1e-6);
  assert(offset.dot(pane.outward) > .44, "spill sits outside its window wall");
  model.position.set(12, 3, -7);
  model.rotation.y = Math.PI / 2;
  const moved = prepareHouseLighting(model);
  assert(moved.spill.distanceTo(lighting.spill) < 1e-6, "anchors stay in building coordinates");
  updateHouseLighting(lighting, .5);
  assert(lighting.panes.every(p => p.material.emissiveIntensity === .425));
  updateHouseLighting(lighting, 0);
  assert(lighting.panes.every(p => p.material.color.equals(p.color)));
  disposeModel(model);
}
const nodes = {}, buildings = new Map();
for(let i=0;i<12;i++) {
  nodes[i] = {id:i,kind:"home",enabled:true,power:i<9?0:1,x:i,z:0};
  buildings.set(i,{houseLighting:{panes:[{}]}});
}
const position = (x,z) => new THREE.Vector3(x,0,z);
const chosen = () => selectBuildingLights(nodes,buildings,new THREE.Vector3(),position);
assert.deepEqual(chosen().map(n=>n.id),[9,10,11],"unpowered homes never exhaust the pool");
nodes[9].enabled=false;
buildings.set(10,{});
assert.deepEqual(chosen().map(n=>n.id),[11],"disabled and unfinished buildings do not emit");
console.log("PASS facility windows, rotated anchors, partial power, and active-light priority.");

const original = new THREE.MeshStandardMaterial({color: '#b86d52', roughness: .12});
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original);
paintVillageModel(mesh);
assert.notEqual(mesh.material, original, 'village finish leaves catalog materials untouched');
assert.equal(original.roughness, .12);
assert(mesh.material.roughness >= .92);
const finished = mesh.material;
paintVillageModel(mesh);
assert.equal(mesh.material, finished, 'reapplying the village finish keeps the same material');
const shader = {...THREE.ShaderLib.standard};
finished.onBeforeCompile(shader);
assert.match(shader.vertexShader, /paintWorld =/);
assert.match(shader.fragmentShader, /reflectedLight\.directDiffuse \*=/);
mesh.geometry.dispose();
original.dispose();
finished.dispose();
console.log('PASS: matte shader, shared catalog isolation and repeated application.');
