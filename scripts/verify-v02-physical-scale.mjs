import { createScalePreview } from '../web/v02/weekend/scale-preview.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ASSETS, createAsset } from '../web/v02/library/catalog.js';
import { BUILDING_MODELS } from '../web/v02/weekend/building-models.js';
import { METRES_PER_CELL } from '../web/v02/library/scale.js';
import { SITE_SPACE, bridgeWidthScale, projectDescription } from '../web/v02/weekend/site-space.js';
import { createSandbox, footprint, plan, moveProject, placementError, route, walkSegmentClear, PROJECTS, requiredLoads, save, restore } from '../web/v02/weekend/simulation.js';

assert.equal(METRES_PER_CELL, 2);
for(const model of BUILDING_MODELS) {
  assert.deepEqual(footprint({key:model.id}), model.size, model.id);
  assert.deepEqual(ASSETS.find(a=>a.id===model.id).footprint, model.size, model.id);
}
const bridge=createAsset('bridge');
const bounds=new THREE.Box3().setFromObject(bridge,true).getSize(new THREE.Vector3());
assert(bounds.z < 2 && bounds.z > 1.8, 'narrow bridge fits one cell including railings');
assert(bounds.x > 15.8 && bounds.x <= 16.01, 'length stays fixed');
const garden=createAsset('garden');
const beds=garden.children.filter(c=>c.name==='growing-bed');
assert.equal(beds.length,4);
// Inspect raised bed borders only; foliage may overhang the soil.
const left=new THREE.Box3().setFromObject(beds[0].children[0],true);
const right=new THREE.Box3().setFromObject(beds[2].children[0],true);
garden.updateMatrixWorld(true);
left.setFromObject(beds[0].children[0],true);right.setFromObject(beds[2].children[0],true);
assert(right.min.x-left.max.x >= 1.79, 'soil beds leave space for the 1.6 m aisle and borders');
assert.equal(SITE_SPACE.garden.productiveArea,19.2);
assert.equal(SITE_SPACE.greenhouse.productiveArea,19.2);

// Real historical save shape: no siteVersion field, all four saved rotations.
for(let rotation=0;rotation<4;rotation++) {
  const s=createSandbox(42);
  s.projects.push({id:s.nextId++,key:'bridge',x:60,z:50,rotation,work:PROJECTS.bridge.work,delivered:requiredLoads("bridge")});
  const restored=restore(save(s));assert(restored);
  const p=restored.projects[0];
  assert.deepEqual(footprint(p), rotation%2 ? [2,8] : [8,2]);
  assert.equal(p.x,60);assert.equal(p.z,50);assert.equal(p.rotation,rotation);
  assert.equal(bridgeWidthScale(p),2);
  assert.match(projectDescription(PROJECTS.bridge,p), /16 × 4 m/);
  assert(!projectDescription(PROJECTS.bridge,p).includes('1.75 m walking'));
  assert(!projectDescription(PROJECTS.bridge,p).includes('8 × 1 cells'));
  assert.match(placementError(restored,'garden',60,50),/occupies/);
  assert.deepEqual(footprint(restore(save(restored)).projects[0]),footprint(p));
  p.siteVersion=2;assert.equal(restore(save(restored)),null,'unknown layouts are rejected');
}
const s=createSandbox(42);
assert.equal(plan(s,'bridge',6,48), '');
const p=s.projects[0];assert.equal(p.siteVersion,1);assert.deepEqual(footprint(p),[8,1]);
assert.equal(bridgeWidthScale(p),1);
const endpoints=[{x:5,z:48},{x:14,z:48}];
const path=route(s,...endpoints);assert(path,'new bridge connects both banks');
let previous=endpoints[0];for(const point of path){assert(walkSegmentClear(s,previous,point));previous=point;}
const reloaded=restore(save(s));assert(reloaded);assert.deepEqual(footprint(reloaded.projects[0]),[8,1]);
assert.equal(moveProject(reloaded,p.id,6,48,2),'');assert.deepEqual(footprint(reloaded.projects[0]),[8,1]);
// Legacy relocation uses the original width in validation and keeps the deck centre.
const old=JSON.parse(save(s));delete old.projects[0].siteVersion;old.projects[0].x=5;old.projects[0].z=39;
const legacy=restore(JSON.stringify(old));assert(legacy);
assert.equal(moveProject(legacy,p.id,5,39,2),'');
assert.deepEqual(footprint(legacy.projects[0]),[8,2]);
for(const z of [39,40])assert(route(legacy,{x:4,z},{x:13,z}),'both legacy lanes remain usable');
p.work=0;assert.equal(route(s,...endpoints),null,'unfinished bridge does not grant a crossing');
const seeded=createScalePreview(), validated=createScalePreview(true);
assert.deepEqual(seeded.projects, validated.projects.map(({billOfMaterials,...p})=>Object.hasOwn(seeded.projects.find(a=>a.id===p.id),'billOfMaterials')?{...p,billOfMaterials}:p), 'desktop fixture preserves legal planned sites while capturing missing paid bills');
assert.deepEqual(seeded.terrainPads, validated.terrainPads);
assert(restore(save(seeded)), 'desktop review fixture remains save-compatible');
console.log('PASS: shared scale, catalog/site agreement, planted areas and garden aisle, narrow bridge geometry and crossing, legacy widths/rotations/occupancy, movement and save round trips.');
