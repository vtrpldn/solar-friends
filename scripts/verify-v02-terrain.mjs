import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BIOMES,buildTerrain,terrainField,biomeLandscape} from '../web/v02/land/terrain.js';
import {validate,encode,decode,decodeBiome} from '../web/v02/land/editor.js';
for(const id of Object.keys(BIOMES)){
  const view=buildTerrain(id), heights=view.mesh.geometry.attributes.position;
  let low=Infinity,high=-Infinity;
  for(let i=0;i<heights.count;i++){low=Math.min(low,heights.getY(i));high=Math.max(high,heights.getY(i));}
  assert(id==='flat'?high===0:high-low>4,`${id}: meaningful elevation`);
  assert(low>-1,`${id}: above skirt bottom`);
  view.mesh.updateMatrixWorld(true);
  for(let n=0;n<80;n++){
    const x=-63+(n*17.31)%126,z=-63+(n*7.67)%126;
    const ray=new THREE.Raycaster(new THREE.Vector3(x,30,z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(view.mesh)[0];
    assert(hit && Math.abs(hit.point.y-view.sample(x,z))<1e-5,`${id}: visible triangles match placement height`);
  }
  const records=validate(biomeLandscape(id));
  assert.deepEqual(records,validate(biomeLandscape(id)));
  const saved=encode(records,id);assert.equal(decodeBiome(saved),id);assert.deepEqual(decode(saved),records);
  if(id!=='flat')assert(records.length>50);
}
const joined=[{id:'a',asset:'garden',column:45,row:45,rotation:0},{id:'b',asset:'garden',column:47,row:45,rotation:0}];
const f=terrainField('mata-atlantica',joined);
for(let x=26;x<=34;x+=.5)for(let z=26;z<=30;z+=.5)assert(Math.abs(f.sample(x,z)-f.sample(28,28))<1e-8,'joined terraces stay level');
assert.equal(decodeBiome(JSON.stringify({props:[]})),'flat');
assert.throws(()=>decodeBiome('{"biome":"unknown"}'));
console.log('PASS: three biome landscapes, terrain height ranges, 320 raycast/height matches, joined terraces and biome scene roundtrips.');

const {createResident}=await import('../web/v02/residents/rig.js');
const {ResidentDirector}=await import('../web/v02/residents/director.js');
const {placementPosition}=await import('../web/v02/land/layout.js');
const bench={id:'bench',asset:'garden-bench',column:46,row:46,rotation:0};
const person={id:'person',asset:'iara',column:42,row:44,rotation:0};
const slope=terrainField('mata-atlantica',[bench,person]);
const actor=createResident('iara');actor.userData.placement=person;
actor.position.set(...placementPosition(person.column,person.row,[1,1]));
actor.position.y=slope.sample(actor.position.x,actor.position.z);
const home=actor.position.clone();
const director=new ResidentDirector([actor],[person,bench],()=>{},slope.sample);
director.start('person',bench,'sit');
for(let frame=0;frame<900;frame++){
  director.tick(1/60);
  assert(Math.abs(actor.position.y-slope.sample(actor.position.x,actor.position.z))<1e-9,'walking/entry follows terrain');
}
assert.equal(director.task.phase,'action');director.stop();assert(actor.position.equals(home));
console.log('PASS: resident approach, interaction and reset on elevated ground.');
