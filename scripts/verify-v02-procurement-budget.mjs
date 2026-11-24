import assert from 'node:assert/strict';
import {collectionBudget,spendableMoney} from '../web/v02/weekend/procurement-budget.js';
import {blueprintManifest,receiveBlueprintShipment,transportCost,projectFreight,TRUCK_LIMITS} from '../web/v02/weekend/physical-trade.js';
import {transact,financeSummary} from '../web/v02/weekend/finances.js';
import {createWeekend,chooseCamp,blueprintPurchase,PROJECTS,save,restore,supplyRun} from '../web/v02/weekend/simulation.js';
const s={time:0,money:100,projects:[{id:1,pendingMaterials:{stone:40}}]};
// 800 kg of stone would need three car trips, so it is quoted as one supplier truck.
assert.deepEqual(collectionBudget(s),{trips:1,cost:44.6,truck:true});
assert.equal(spendableMoney(s),55.4);
assert.deepEqual(collectionBudget({...s,projects:[{id:1,pendingMaterials:{stone:10}}]}),{trips:1,cost:7.76},'one car load stays a resident pickup');
assert.equal(transact(s,-83,'purchases','Cannot steal transport'),0);
assert.equal(transact(s,-83,'electricity','Cannot steal transport'),0);
assert.equal(s.money,100);
const remote=collectionBudget({...s,worldSettings:{town:'remote'}});
assert.equal(remote.cost,transportCost({worldSettings:{town:'remote'},deliveryOnly:true}));
transact(s,-44.6,'transport','Freight');s.delivery={shipments:blueprintManifest(s.projects,TRUCK_LIMITS)};
assert.equal(collectionBudget(s).cost,0);
assert.equal(spendableMoney(s),55.4,'departure consumes reserved cash, not available money');
receiveBlueprintShipment(s,s.delivery);s.delivery=null;
assert.equal(collectionBudget(s).cost,0,'unloading does not release a fare twice');
assert.equal(financeSummary(s).committed,0);
assert.equal(financeSummary(s).available,55.4);
assert.equal(collectionBudget({...s,mode:'sandbox'}).cost,0);
const merged={money:100,projects:[{id:1,pendingMaterials:{wood:4}}]};
assert.equal(collectionBudget(merged,{wood:4}).trips,1,'compatible orders share a fare');
const heavy={money:100000,projects:[{id:1,pendingMaterials:{stone:260}}]};
assert.deepEqual(collectionBudget(heavy),{trips:2,cost:52.36,truck:true},'a full truck leaves one car load behind');
const legacy={money:100,projects:[{id:1,pendingMaterials:{stone:40}}],trip:{project:1}};
assert.equal(collectionBudget(legacy).cost,0,'old full-order trip remains prepaid');
const village=createWeekend(42);chooseCamp(village,'entrance');
const key=Object.keys(PROJECTS).find(k=>blueprintPurchase(village,k).cost>0);
const quote=blueprintPurchase(village,key);village.money=quote.cost+quote.transport-.01;
assert(blueprintPurchase(village,key).error,'full delivery budget required');
// Use a real valid project/save rather than a permissive budget-only fixture.
const imported=JSON.parse(save(village));
imported.nextId=901;imported.projects.push({id:900,key,x:60,z:60,rotation:0,work:0,delivered:0,pendingMaterials:quote.items});
const loaded=restore(JSON.stringify(imported));assert(loaded,'budget is derived after restore');
assert.equal(collectionBudget(loaded).cost,quote.transport);
loaded.money=collectionBudget(loaded).cost;
assert(!supplyRun(loaded,'wood'),'ordinary shopping cannot use construction transport reserve');
assert.equal(spendableMoney(loaded),0);
console.log('PASS full manifests, shared fares, paid shipments, legacy trips, save restoration and protected cash');
const {crewEfficiency,constructionEstimate}=await import('../web/v02/weekend/construction-logistics.js');
const definition={work:1000,size:[4,2]},project={id:1,work:0};
const one=constructionEstimate({people:[{job:1,action:'build'}]},project,definition);
const three=constructionEstimate({people:Array.from({length:3},()=>({job:1,action:'build'}))},project,definition);
assert.equal(one.remainingHours,7.5);
assert(three.assemblyHours>one.assemblyHours/3&&three.assemblyHours<one.assemblyHours,'crew helps without perfect linear scaling');
assert.equal(crewEfficiency(1),1);
assert.equal(constructionEstimate({people:[]},project,definition).assemblyHours,null,'no false deadline without workers');
console.log('PASS assembly estimates and diminishing crew efficiency');
// Every catalog recipe must be collectable, and quoted manifests must match
// actual repeated dispatch/unloading without phantom fees or dropped goods.
for(const [key,def]of Object.entries(PROJECTS)){
 const state={money:100000,time:0,projects:[{id:1,pendingMaterials:{...def.materials}}]};
 const quoted=collectionBudget(state);assert(Number.isFinite(quoted.cost),`${key} fits shipments`);
 let paid=0;
 while(Object.values(state.projects[0].pendingMaterials||{}).some(n=>n>0)){
  const freight=projectFreight(state,state.projects),shipments=blueprintManifest(state.projects,freight.limits);assert(shipments.length,key);
  const spendableBefore=spendableMoney(state),slot=freight.truck?'delivery':'trip';
  transact(state,-freight.fare,'transport','Collection');paid=Math.round((paid+freight.fare)*100)/100;
  state[slot]={shipments};assert.equal(spendableMoney(state),spendableBefore,`${key} reservation release`);
  receiveBlueprintShipment(state,state[slot]);state[slot]=null;
 }
 assert.equal(paid,quoted.cost,`${key} exact collection quote`);
 assert.equal(collectionBudget(state).cost,0);
}
console.log('PASS every catalog bill of materials reconciles quoted and actual collection fares, by car or truck');
const boarding={money:100,projects:[{id:1,pendingMaterials:{wood:4}}],trip:{phase:'boarding',shipments:[{project:1,items:{wood:4}}]}};
assert.equal(collectionBudget(boarding,{wood:4}).cost,0,'small added order shares paid boarding trip');
assert.equal(collectionBudget(boarding,{stone:17}).cost,7.76,'overflow reserves only unpaid trips');
assert.deepEqual(collectionBudget(boarding,{stone:100}),{trips:1,cost:44.6,truck:true},'a large overflow follows by truck');
boarding.trip.phase='outbound';
assert.equal(collectionBudget(boarding,{wood:4}).cost,7.76,'departed manifest cannot accept new cargo');
console.log('PASS boarding consolidation releases only the already-paid fare and locks on departure');
