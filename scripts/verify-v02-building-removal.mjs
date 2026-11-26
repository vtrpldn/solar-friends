import assert from 'node:assert/strict';
import {PROJECTS,PROCESSES,plan,removeProject,save,restore,materialCount,placementError,moveProject} from '../web/v02/weekend/simulation.js';
import {removalYield} from '../web/v02/weekend/building-lifecycle.js';
import {village,advance} from './fixtures.mjs';
function place(s){for(let z=s.stock.z-8;z<s.stock.z+8;z++)for(let x=s.stock.x-8;x<s.stock.x+8;x++)if(!placementError(s,'gathering',x,z))return plan(s,'gathering',x,z);return 'No site';}
for(const mode of ['demolish','salvage']){
 const {s}=village();
 assert.equal(place(s),'');const p=s.projects.at(-1);
 advance(s,{seconds:1600,until:()=>p.work>=PROJECTS.gathering.work});
 assert.equal(p.work,PROJECTS.gathering.work);
 const initial=Object.fromEntries(Object.keys(PROJECTS.gathering.materials).map(id=>[id,materialCount(s,id)]));
 assert.equal(removeProject(s,p.id,mode),'');assert.notEqual(removeProject(s,p.id,mode),'','duplicate command cannot duplicate work');
 const expected=removalYield(p,PROJECTS,PROCESSES,mode).recovered;
 assert(restore(save(s)),'queued removal restores');
 advance(s,{seconds:1600,until:()=>!s.projects.includes(p)});
 assert(!s.projects.includes(p),'resident completes dismantling');
 for(const [id,n]of Object.entries(expected))assert.equal(materialCount(s,id),initial[id]+n);
 assert.equal(s.buildingHistory.length,1);assert(restore(save(s)),'completed removal restores');
 advance(s,{seconds:10});assert.equal(s.buildingHistory.length,1,'settlement cannot repeat');
}
const {s}=village();
const wood=s.wood;assert.equal(place(s),'');const p=s.projects.at(-1);
assert.equal(removeProject(s,p.id,'salvage'),'');advance(s,{seconds:1600,until:()=>!s.projects.includes(p)});
assert.equal(s.wood,wood,'unassembled reservations return intact');assert(restore(save(s)));
console.log('PASS resident demolition and salvage, exact recovery/loss, unassembled reservation return, duplicate command and save checks');

const {s:moved}=village();assert.equal(place(moved),'');const building=moved.projects.at(-1);
advance(moved,{seconds:1600,until:()=>building.work>=PROJECTS.gathering.work});
let destination;for(let z=moved.stock.z;z<moved.stock.z+15&&!destination;z++)for(let x=moved.stock.x;x<moved.stock.x+15&&!destination;x++)if(Math.hypot(x-building.x,z-building.z)>5&&!placementError(moved,'gathering',x,z,building.id,1))destination={x,z};
assert(destination);const old={x:building.x,z:building.z},stock=moved.wood;
assert.equal(moveProject(moved,building.id,destination.x,destination.z,1),'');assert.deepEqual({x:building.x,z:building.z},old,'queueing does not teleport building');
assert.match(placementError(moved,'road',destination.x,destination.z),/reserved/);
assert(restore(save(moved)),'relocation saves');
advance(moved,{seconds:1600,until:()=>!building.removal});
assert(!building.removal);assert.equal(building.x,destination.x);assert.equal(building.rotation,1);assert.equal(moved.wood,stock);assert(restore(save(moved)));
console.log('PASS physical resident relocation, reserved destination, preserved materials and reload');

const {s:depot}=village();
depot.projects.push({id:depot.nextId++,key:'warehouse',x:24,z:-12,work:PROJECTS.warehouse.work,delivered:0},{id:depot.nextId++,key:'gathering',x:31,z:-10,work:0,delivered:0,depot:1,staged:1,pendingMaterials:{wood:1}});
assert.equal(removeProject(depot,1,'demolish'),'');
// Exercise the final physical dismantling and reference cleanup; full demolition
// labor is covered above without replaying an entire warehouse shell lifetime.
depot.projects[0].removal.work=depot.projects[0].removal.required-10;
advance(depot,{seconds:1600,until:()=>!depot.projects.some(p=>p.id===1)});
assert(!depot.projects.some(p=>p.id===1));assert(depot.projects.every(p=>p.depot!==1));assert(restore(save(depot)),'removing a material depot leaves no dangling storage reference');
console.log('PASS removed staging depot releases project references without losing save validity');
