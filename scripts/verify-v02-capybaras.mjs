import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWeekend} from '../web/v02/weekend/simulation.js';
import {createCapybaraVisitors} from '../web/v02/weekend/capybaras.js';
const scene=new THREE.Scene(),s=createWeekend(42),wild=createCapybaraVisitors(scene,s,{random:()=>.5});
let visited=false,left=false;
for(let i=0;i<2500;i++){
 wild.update(.1);assert(wild.count<=2);
 if(wild.count)visited=true;else if(visited)left=true;
 scene.traverse(o=>assert(o.position.toArray().every(Number.isFinite)));
}
assert(visited&&left);const snapshot=scene.toJSON();wild.update(0);assert.deepEqual(scene.toJSON(),snapshot);
wild.dispose();assert.equal(scene.children.length,0);
console.log('PASS: capybara visits, bounded population, finite terrain positions, departure, pause and cleanup');
