import assert from 'node:assert/strict';
import {createWeekend, chooseCamp, plan, tick, blueprintPurchase, PROJECTS, save, restore, materialCount} from '../web/v02/weekend/simulation.js';
import {ensureInfrastructure} from '../web/v02/weekend/infrastructure.js';
function fresh(){
 const s=createWeekend();s.arrivalElapsed=17;chooseCamp(s,'clearing');
 ensureInfrastructure(s).grid.enabled=false;
 s.money=10000;s.wood=0;for(const id of Object.keys(s.materials))s.materials[id]=0;
 s.materials.food=50;s.materials.meals=50;
 return s;
}
const s=fresh(), quote=blueprintPurchase(s,'shelter');
assert(quote.cost>0 && Object.keys(quote.items).length>1);
const before=s.money;
assert.equal(plan(s,'shelter',40,39),'');
assert.equal(s.money,before-quote.cost);assert.equal(s.trip.phase,'boarding');
assert.equal(s.trip.project,s.projects[0].id);
for(let i=0;i<20;i++)tick(s,.1);
assert.equal(s.projects[0].work,0);assert.equal(s.projects[0].delivered,0);
const loaded=restore(save(s));assert(loaded);assert.deepEqual(loaded.projects[0].pendingMaterials,quote.items);
assert.equal(plan(s,'gathering',29,35),'');
const paid=s.money;
const phases=new Set();
for(let i=0;i<12000 && (s.trip||s.projects.some(p=>p.pendingMaterials));i++){
 if(s.trip)phases.add(s.trip.phase);tick(s,.1);
}
assert.equal(s.trip,null);assert(s.projects.every(p=>!p.pendingMaterials));
assert.equal(s.money,paid,'queued pickups do not bill twice');
for(const phase of ['boarding','outbound','away','inbound','unloading'])assert(phases.has(phase));
assert.equal(s.wood,0,'purchases remain reserved, not available for another blueprint');
for(let i=0;i<20000 && s.projects.some(p=>p.work<PROJECTS[p.key].work);i++)tick(s,.1);
assert(s.projects.every(p=>p.work===PROJECTS[p.key].work),'construction finishes after delivery');
for(let i=0;i<12000 && loaded.projects[0].pendingMaterials;i++)tick(loaded,.1);
assert(!loaded.projects[0].pendingMaterials);assert.equal(loaded.money,before-quote.cost);
const broke=fresh();broke.money=0;const snapshot=JSON.stringify(broke);
assert.match(plan(broke,'shelter',40,39),/savings/);assert.equal(JSON.stringify(broke),snapshot);
const tired=fresh();tired.people.forEach(r=>r.energy=10);
assert.equal(plan(tired,'shelter',40,39),'');assert.equal(tired.trip,null);
for(let i=0;i<10000&&!tired.trip;i++)tick(tired,.1);
assert(tired.trip,'pickup starts after resident recovers');
const partial=fresh();partial.wood=7;const partialQuote=blueprintPurchase(partial,'shelter');
assert.equal(partialQuote.items.wood,PROJECTS.shelter.materials.wood-7);
assert.equal(plan(partial,'shelter',40,39),'');assert.equal(partial.wood,0);
console.log('PASS: exact shortage purchase, immediate pickup, queued orders, physical delivery, construction gating, recovery, save resume and atomic insufficient funds.');
