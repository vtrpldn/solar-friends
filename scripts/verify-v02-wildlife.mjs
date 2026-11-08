import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWildlife} from '../web/v02/weekend/wildlife.js';
import {createWeekend} from '../web/v02/weekend/simulation.js';
for(const value of [.1,.8]){
 const scene=new THREE.Scene(),wildlife=createWildlife(scene,createWeekend(42),{random:()=>value});
 wildlife.update(0);assert.equal(wildlife.count,0);
 for(let i=0;i<1600;i++){
  wildlife.update(.1);assert(wildlife.count<=4,'visitors stay bounded');
  scene.traverse(o=>assert(Number.isFinite(o.position.y)));
 }
 assert(scene.children[0].children.length<=4);
 wildlife.dispose();assert.equal(scene.children.length,0);
}
const scene=new THREE.Scene(),w=createWildlife(scene,createWeekend(42),{random:()=>.8});
for(let i=0;i<210;i++)w.update(.1);
assert(w.count>0,'first visit arrives');
for(let i=0;i<200;i++)w.update(.1);
assert.equal(w.count,0,'completed visits leave');
for(let i=0;i<800;i++)w.update(.1);
assert(w.count>0,'new visits recur');
const count=w.count;w.update(0);assert.equal(w.count,count,'pause freezes visitors');
w.dispose();
console.log('PASS: recurring bounded visits, finite terrain positions, pause and cleanup.');
