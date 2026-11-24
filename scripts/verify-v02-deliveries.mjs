import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,supplyRun,tick,save,restore,plan,PROJECTS,enableFastNavigation,blueprintPurchase} from '../web/v02/weekend/simulation.js';
import {blueprintManifest,cargoSize,transportCost,fitsCargo} from '../web/v02/weekend/physical-trade.js';
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
// Without the delivery policy, a project order beyond one car load still comes by truck; a small one uses a car.
const a=createWeekend(42);chooseCamp(a,'entrance');enableFastNavigation(a);a.emergencyFood=false;a.money=100000;
const big=Object.keys(PROJECTS).find(k=>blueprintPurchase(a,k).cost>0&&!fitsCargo(blueprintPurchase(a,k).items)&&fitsCargo(blueprintPurchase(a,k).items,DELIVERY_LIMITS));assert(big,'catalog has a truck-sized order');
const quote=blueprintPurchase(a,big);assert.equal(quote.transport,transportCost({...a,deliveryOnly:true}));
let spot;for(let x=-40;x<=40&&!spot;x+=2)for(let z=-40;z<=40&&!spot;z+=2)if(plan(structuredClone(a),big,x,z)==='')spot=[x,z];
assert(spot,'site found');assert.equal(plan(a,big,...spot),'');
assert(a.delivery?.shipments,'truck ordered automatically');assert.equal(a.trip,null,'no resident drives');
assert.equal(a.finances.categories.transport,-quote.transport);assert.equal(collectionBudget(a).cost,0);
assert(restore(save(a)));
for(let i=0;i<15000&&a.delivery;i++)tick(a,.1);
assert.equal(a.delivery,null);assert(!a.projects.at(0).pendingMaterials&&!a.projects.some(p=>p.pendingMaterials),'whole order unloaded');
assert.equal(a.trip,null);assert.equal(a.finances.categories.transport,-quote.transport,'one freight charge only');
console.log('PASS paid freight without drivers, delayed physical goods, larger cargo, save settlement, protected freight budget and automatic trucks for large project orders');
