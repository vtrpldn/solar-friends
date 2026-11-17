import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAsset,disposeModel} from '../web/v02/library/catalog.js';
const models=['coop-construction-0','coop-construction-1','coop'].map(id=>createAsset(id));
const [groundwork,assembly,finished]=models;
const bounds=o=>new THREE.Box3().setFromObject(o,true);
for(const model of models){
 assert(model.getObjectByName('coop-house').position.distanceTo(finished.getObjectByName('coop-house').position)<1e-6,'house anchor remains fixed');
 const run=bounds(model.getObjectByName('coop-run')),end=bounds(finished.getObjectByName('coop-run'));
 for(const axis of ['x','z']){assert.equal(run.min[axis],end.min[axis]);assert.equal(run.max[axis],end.max[axis]);}
 assert.equal(model.userData.revision,5);
}
const frame=m=>{const g=m.getObjectByName('coop-frame');return g.children.map(o=>({matrix:o.matrixWorld.toArray().map(n=>+n.toFixed(6)),bounds:bounds(o).getSize(new THREE.Vector3()).toArray().map(n=>+n.toFixed(6))}));};
assert.deepEqual(frame(assembly),frame(finished),'assembly framing must remain in the completed coop');
assert(!groundwork.getObjectByName('functional-roof'));assert(!assembly.getObjectByName('functional-roof'));assert(finished.getObjectByName('functional-roof'));
for(const model of [groundwork,assembly])assert(!model.children.some(o=>o.animalRig),'no hens on an unfinished site');
assert.equal(finished.children.filter(o=>o.animalRig).length,3);
models.forEach(disposeModel);
console.log('PASS coop stages preserve run bounds, house anchors and structural frame; roof and hens appear only on completion');
