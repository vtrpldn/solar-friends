import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createResident,RESIDENT_IDS,poseResident} from '../web/v02/residents/rig.js';
import {createAsset} from '../web/v02/library/catalog.js';
import {createHash} from 'node:crypto';
const signatures=new Set(),baseline=createResident().rig;
const anchors=rig=>rig.joints.map(j=>[j.name,...j.position.toArray()]);
poseResident(baseline,'idle',0);
for(const id of RESIDENT_IDS.slice(1)){
 const resident=createResident(id),again=createResident(id),catalog=createAsset(id);
 assert.deepEqual(anchors(resident.rig),anchors(baseline),'identity preserves joint and tool alignment');
 let triangles=0;const silhouette=createHash('sha256');
 catalog.updateMatrixWorld(true);
 catalog.traverse(mesh=>{
  if(!mesh.isMesh)return;
  triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;
  silhouette.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));
  silhouette.update(JSON.stringify(mesh.matrixWorld.elements));
  assert.equal(mesh.material.roughness,1,'matte material language');
 });
 assert(triangles<=800,`${id}: ${triangles} exceeds resident budget`);
 signatures.add(silhouette.digest('hex'));
 const materials=root=>{const found=[];root.traverse(mesh=>{if(mesh.isMesh)found.push(mesh.material.uuid);});return found;};
 assert.deepEqual(materials(resident),materials(again),'identity materials are reused across instances');
 for(const action of ['carry-walk','water','work','sit']){
  poseResident(resident.rig,action,.4);poseResident(baseline,action,.4);
  assert.deepEqual(anchors(resident.rig),anchors(baseline),`${id}: ${action} keeps interaction anchors`);
 }
 poseResident(baseline,'idle',0);
 console.log(`${id}: ${triangles} triangles`);
}
assert.equal(signatures.size,5,'each friend has a different geometry silhouette, independent of color');
console.log('PASS five distinct geometries, shared interaction anchors, matte materials, allocation reuse and triangle budgets');
