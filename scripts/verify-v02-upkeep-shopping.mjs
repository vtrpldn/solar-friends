import assert from 'node:assert/strict';
import {createWeekend, chooseCamp, enableFastNavigation, tick, PROJECTS, MATERIALS, save, restore} from '../web/v02/weekend/simulation.js';
import {upkeep} from '../web/v02/weekend/asset-upkeep.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {pickupFare} from '../web/v02/weekend/physical-trade.js';

function village(key) {
  const s=createWeekend(0);
  chooseCamp(s,'entrance');
  enableFastNavigation(s);
  s.emergencyFood=false;
  s.deliveryOnly=true;
  const p={id:s.nextId++,key,x:s.stock.x+4,z:s.stock.z+4,work:PROJECTS[key].work,delivered:0};
  s.projects.push(p);
  syncInfrastructure(s,PROJECTS);
  return {s,p,u:upkeep(s)};
}
function runUntil(s,predicate,maxSteps) {
  for (let i=0;i<maxSteps&&!predicate();i++) tick(s,.1);
  assert(predicate());
}
const {s,p,u}=village('coop');
s.infrastructure.nodes[p.id].water[0]=6;
s.materials.fodder=0;
s.foodReserveDays=0;
tick(s,.1);
assert(!s.delivery,'zero default allowance');
const cost=MATERIALS.fodder.price+pickupFare(s);
u.restockBudget=cost-.01;
for(let i=0;i<120;i++)tick(s,.1);
assert(!s.delivery,'freight counts toward the cap');
u.restockBudget=cost;
runUntil(s,()=>s.delivery?.material==='fodder',120);
assert.equal(u.restockSpent,cost);
const loaded=restore(save(s));assert(loaded);enableFastNavigation(loaded);
const flock=loaded.projects.find(q=>q.id===p.id);
runUntil(loaded,()=>flock.animalCare?.feed>0,20000);
assert.equal(loaded.upkeep.restockSpent,cost);
assert.equal(loaded.suppliers.fodder.units,MATERIALS.fodder.quantity);

const repair=village('shed');
repair.p.condition=60;repair.s.materials.tools=0;repair.s.materials.hardware=4;
repair.u.dailyBudget=1000;
repair.u.restockBudget=MATERIALS.tools.price+pickupFare(repair.s);
runUntil(repair.s,()=>repair.p.condition>95,30000);
assert.equal(repair.s.suppliers.tools.units,MATERIALS.tools.quantity);
console.log('PASS budgeted feed and repair shopping, delivery, save reload and resident work');
