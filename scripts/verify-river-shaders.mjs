import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRiver,riverCenter,riverWidth} from '../web/v02/weekend/river.js';
import {registerWorld,DEFAULT_SETTINGS} from '../web/v02/weekend/world-settings.js';
import {MAP_HALF} from '../web/v02/weekend/map-size.js';
import {compactModel,disposeModel} from '../web/v02/library/catalog.js';
let cases=0;
for(const seed of [0,1,972341,4294967295])for(const water of ['dry','seasonal','abundant'])for(const biome of ['mata-atlantica','cerrado','caatinga']){
 registerWorld(seed,{...DEFAULT_SETTINGS,water,biome});
 const river=createRiver(seed),again=createRiver(seed),geometry=river.current.geometry;
 assert.equal(river.root.children.length,again.root.children.length);
 river.root.children.forEach((mesh,i)=>{
  assert.deepEqual(mesh.position.toArray(),again.root.children[i].position.toArray(),'stable decoration positions');
  assert.deepEqual(mesh.geometry.attributes.position.array,again.root.children[i].geometry.attributes.position.array);
 });
 const positions=geometry.attributes.position,uv=geometry.attributes.uv;
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),z=positions.getZ(i),side=uv.getX(i);
  assert(Math.abs(x-riverCenter(z,seed)-side*riverWidth(z,seed))<1e-5,'water matches navigation boundary');
  assert(z>=-MAP_HALF&&z<=MAP_HALF);
  assert(geometry.attributes.normal.getY(i)>.99);
 }
 river.root.updateMatrixWorld(true);
 const point=new THREE.Vector3();
 river.root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){
   point.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
   assert(Math.abs(point.x-riverCenter(point.z,seed))<=riverWidth(point.z,seed)+1.95,'details stay in reserved river margin');
   assert(Math.abs(point.z)<=MAP_HALF+.001,'details stay on map');
  }
 });
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 river.current.material.onBeforeCompile(shader);
 const version=positions.version,before=positions.array.slice();river.update(4);
 assert.equal(shader.uniforms.riverTime.value,4);river.update(4);
 assert.equal(shader.uniforms.riverTime.value,4,'paused timestamp stays stable');
 assert.equal(positions.version,version,'animation does not upload geometry');assert.deepEqual(positions.array,before);
 assert.equal(shader.uniforms.riverRocks.value.length,8);
 const merged=compactModel(river.root);assert(merged.children.length<=10,'bank details stay batched');
 disposeModel(merged);disposeModel(river.current);disposeModel(again.root);disposeModel(again.current);cases++;
}
console.log(`PASS ${cases} rivers: deterministic details, water boundaries, bank clearance, normals, batched geometry and shader animation`);
