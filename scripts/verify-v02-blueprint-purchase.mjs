import {collectionBudget} from "../web/v02/weekend/procurement-budget.js";
import {transportCost,blueprintManifest} from "../web/v02/weekend/physical-trade.js";
import assert from 'node:assert/strict';
import {plan, tick, blueprintPurchase, PROJECTS, save, restore, materialCount} from '../web/v02/weekend/simulation.js';
import {village,advance} from './fixtures.mjs';
function fresh(){
 return village({seed:0,camp:'clearing',fast:false,grid:false,money:10000,wood:0,zero:true,materials:{food:15,meals:25}}).s;
}
const s=fresh(), quote=blueprintPurchase(s,'shelter');
assert(quote.cost>0 && Object.keys(quote.items).length>1);
const before=s.money;
assert.equal(plan(s,'shelter',40,39),'');
assert.equal(s.money,Math.round((before-quote.cost-transportCost(s))*100)/100);assert.equal(s.trip.phase,'boarding');
assert.equal(s.trip.project,s.projects[0].id);
advance(s,{seconds:2});
assert.equal(s.projects[0].work,0);assert.equal(s.projects[0].delivered,0);
const loaded=restore(save(s));assert(loaded);assert.deepEqual(loaded.projects[0].pendingMaterials,quote.items);
assert.equal(plan(s,'gathering',29,35),'');
const paid=s.money, remainingFares=collectionBudget(s).cost;
const phases=new Set();
for(let i=0;i<12000 && (s.trip||s.projects.some(p=>p.pendingMaterials));i++){
 if(s.trip)phases.add(s.trip.phase);tick(s,.1);
}
assert.equal(s.trip,null);assert(s.projects.every(p=>!p.pendingMaterials));
assert.equal(s.money,Math.round((paid-remainingFares)*100)/100,'remaining pickups charge only their quoted fuel');
for(const phase of ['boarding','outbound','away','inbound','unloading'])assert(phases.has(phase));
assert.equal(s.wood,0,'purchases remain reserved, not available for another blueprint');
advance(s,{seconds:2000,until:()=>!s.projects.some(p=>p.work<PROJECTS[p.key].work)});
assert(s.projects.every(p=>p.work===PROJECTS[p.key].work),'construction finishes after delivery');
advance(loaded,{seconds:1200,until:()=>!loaded.projects[0].pendingMaterials});
assert(!loaded.projects[0].pendingMaterials);assert.equal(loaded.money,Math.round((before-quote.cost-transportCost(loaded))*100)/100);
const broke=fresh();broke.money=0;const snapshot=JSON.stringify(broke);
assert.match(plan(broke,'shelter',40,39),/savings/);assert.equal(JSON.stringify(broke),snapshot);
const tired=fresh();tired.people.forEach(r=>r.energy=10);
assert.equal(plan(tired,'shelter',40,39),'');assert.equal(tired.trip,null);
advance(tired,{seconds:1000,until:()=>tired.trip});
assert(tired.trip,'pickup starts after resident recovers');
const partial=fresh();partial.wood=7;const partialQuote=blueprintPurchase(partial,'shelter');
assert.equal(partialQuote.items.wood,PROJECTS.shelter.materials.wood-7);
assert.equal(plan(partial,'shelter',40,39),'');assert.equal(partial.wood,0);
console.log('PASS: exact shortage purchase, immediate pickup, queued orders, physical delivery, construction gating, recovery, save resume and atomic insufficient funds.');

const batch=fresh();
assert.equal(plan(batch,'shelter',40,39),'');
assert.equal(plan(batch,'gathering',29,35),'');
assert.deepEqual(batch.trip.shipments,blueprintManifest(batch.projects),'boarding manifest respects capacity');
assert(restore(save(batch)), 'batched pickup survives saving');
const invalidBatch=JSON.parse(save(batch));invalidBatch.trip.projects.push('missing-project');
assert.equal(restore(JSON.stringify(invalidBatch)),null);
const batchMoney=batch.money;
while(batch.trip?.phase==='boarding')tick(batch,.1);
const departedIds=[...batch.trip.projects];
assert.equal(plan(batch,'covered-stores',45,39),'');
assert.deepEqual(batch.trip.projects,departedIds,'departed car cannot collect a later order');
while(batch.projects[0].pendingMaterials)tick(batch,.1);
assert.equal(!batch.projects[1].pendingMaterials,departedIds.includes(batch.projects[1].id),'only projects on the manifest arrive with the first trip');
assert(batch.projects[2].pendingMaterials,'later order waits for the next pickup');
assert(batch.money<batchMoney);
console.log('PASS: batching before departure, later-order queue and saved manifest validation.');

const manual=fresh();manual.autoBuy=false;
const original=JSON.stringify(manual);
assert.match(plan(manual,'shelter',40,39),/Auto-buy is off/);
assert.equal(JSON.stringify(manual),original,'disabled auto-buy must not spend or reserve anything');
assert.equal(restore(save(manual)).autoBuy,false);
manual.autoBuy=true;assert.equal(plan(manual,'shelter',40,39),'');
console.log('PASS: auto-buy toggle prevents purchases, persists and can be re-enabled.');
