import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,supplyRun,tick,save,restore,plan,PROJECTS,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {blueprintManifest,cargoSize,transportCost} from '../web/v02/weekend/physical-trade.js';
import {DELIVERY_LIMITS} from '../web/v02/weekend/deliveries.js';
import {collectionBudget} from '../web/v02/weekend/procurement-budget.js';
const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);s.emergencyFood=false;s.deliveryOnly=true;
for(const r of s.people)r.energy=10;
const before=s.wood;assert(supplyRun(s,'wood'),'no driver needed');assert.equal(s.trip,null);assert.equal(s.wood,before);
const restored=restore(save(s));assert(restored,'delivery persists');enableFastNavigation(restored);
for(const v of [s,restored]){for(let i=0;i<15000&&v.delivery;i++)tick(v,.1);assert.equal(v.delivery,null);assert.equal(v.wood,before+12);assert.equal(v.finances.categories.transport,-44.6);}
const large=blueprintManifest([{id:1,pendingMaterials:{stone:100}}],DELIVERY_LIMITS);assert.equal(large[0].items.stone,100);assert.equal(cargoSize(large[0].items).kg,2000);
const p=createWeekend(42);chooseCamp(p,'entrance');p.deliveryOnly=true;p.wood=0;
assert.equal(plan(p,'shelter',p.stock.x+5,p.stock.z+5),'');assert(p.delivery?.shipments);assert.equal(collectionBudget(p).cost,0,'already-paid freight not reserved twice');assert(restore(save(p)));
const bad=JSON.parse(save(p));bad.delivery.left=-1;assert.equal(restore(JSON.stringify(bad)),null);
console.log('PASS paid freight without drivers, delayed physical goods, larger cargo, save settlement and protected freight budget');
