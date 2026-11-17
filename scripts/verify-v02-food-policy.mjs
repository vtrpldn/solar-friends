import assert from 'node:assert/strict';
import {foodPolicy,kitchenPlan,validFoodPolicy} from '../web/v02/weekend/food-policy.js';
import {ensureFoodStorage,foodChange,freshLots,foodStorageStep} from '../web/v02/weekend/food-storage.js';
import {coolStoredFood,coolingStatus} from '../web/v02/weekend/cold-storage.js';
import {createWeekend,chooseCamp,enableFastNavigation,PROJECTS,PROCESSES,productionBlocker,storedMaterials,storageCapacity,tick,save,restore} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
const api={blocker:productionBlocker,stored:storedMaterials,capacity:storageCapacity};
function fixture(){
 const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);ensureFoodStorage(s);foodPolicy(s).automatic=true;
 for(const id of ['food','meals','eggs','milk'])foodChange(s,id,-s.materials[id]);
 foodChange(s,'food',60);foodChange(s,'beans',8);foodChange(s,'greens',8,[{n:8,expires:500}]);
 const kitchens=[];
 for(let i=0;i<2;i++){const p={id:s.nextId++,key:'kitchen',x:s.stock.x+3+i*5,z:s.stock.z+3,rotation:0,work:PROJECTS.kitchen.work,delivered:0};s.projects.push(p);kitchens.push(p);}
 const sys=syncInfrastructure(s,PROJECTS);sys.biogas=100;
 for(const p of kitchens)sys.nodes[p.id].water[0]=sys.nodes[p.id].capacity[0];
 s.rainSeen=s.rainResolved=true;return {s,kitchens};
}
const {s,kitchens}=fixture();const p=kitchens[0];
assert.equal(kitchenPlan(s,p,PROCESSES,api).recipe,'cook_greens','earliest viable crop is cooked first');
tick(s,.1);assert.equal(s.operations.filter(o=>!o.done&&PROCESSES[o.recipe]?.output.meals).length,2);
assert.equal(s.materials.greens,0,'two kitchens reserve different batches');
assert.equal(s.operations.reduce((n,o)=>n+(PROCESSES[o.recipe]?.output.meals||0),0),8,'whole batches stay below ten-portion target');
foodPolicy(s).freshDays=2.5;foodPolicy(s).provisionDays=3;foodPolicy(s).coolingPriority='meals';assert.deepEqual(restore(save(s)).foodPolicy,s.foodPolicy);
const repeating=fixture();repeating.kitchens[0].repeat='preserve_meals';assert.match(kitchenPlan(repeating.s,repeating.kitchens[0],PROCESSES,api).reason,/manual repeating/);
const disabled=fixture();disabled.s.infrastructure.nodes[disabled.kitchens[0].id].enabled=false;assert.match(kitchenPlan(disabled.s,disabled.kitchens[0],PROCESSES,api).reason,/switched off/);
const floor=fixture();foodChange(floor.s,'food',-(floor.s.materials.food-10));foodChange(floor.s,'greens',-8);foodChange(floor.s,'beans',-8);
assert.equal(kitchenPlan(floor.s,floor.kitchens[0],PROCESSES,api).recipe,undefined,'no conversion spends the last day of food');
const dry=fixture();foodPolicy(dry.s).freshDays=0;assert.equal(kitchenPlan(dry.s,dry.kitchens[0],PROCESSES,api).recipe,'preserve_meals');
const expiry=fixture();foodChange(expiry.s,'greens',-8);foodChange(expiry.s,'beans',-8);expiry.s.foodStorage.lots.food[0].expires=1;
assert.equal(kitchenPlan(expiry.s,expiry.kitchens[0],PROCESSES,api).recipe,undefined);
const full=fixture();assert.equal(kitchenPlan(full.s,full.kitchens[0],PROCESSES,{...api,capacity:()=>0}).recipe,undefined);
for(const value of [null,{version:2},{...foodPolicy(s),freshDays:Infinity},{...foodPolicy(s),coolingPriority:'magic'}]){s.foodPolicy=value;assert(!validFoodPolicy(s));assert.equal(restore(save(s)),null);}
delete s.foodPolicy;foodPolicy(s).freshDays=2.5;foodPolicy(s).provisionDays=3;foodPolicy(s).coolingPriority='meals';assert.deepEqual(restore(save(s)).foodPolicy,s.foodPolicy);assert.equal(foodPolicy(s).automatic,false);
// 80 L fits 20 kg leafy greens, or 40 meals, or 800 eggs; allocation never creates stock.
const cold={time:0,materials:{greens:30,meals:40,eggs:12},infrastructure:{nodes:{1:{coldStorage:true,enabled:true,power:1}}}};
ensureFoodStorage(cold);foodPolicy(cold).coolingPriority='ingredients';cold.time=1;coolStoredFood(cold,1);
assert(coolingStatus(cold).occupied<=80+1e-8);assert.equal(cold.foodStorage.lots.meals.filter(l=>l.chilled).length,0);
foodPolicy(cold).coolingPriority='meals';cold.time++;coolStoredFood(cold,1);
assert.equal(cold.foodStorage.lots.meals.filter(l=>l.chilled).reduce((n,l)=>n+l.n,0),40);
assert.equal(cold.foodStorage.lots.greens.filter(l=>l.chilled).length,0);
for(let i=0;i<1000;i++){cold.time+=.1;coolStoredFood(cold,.1);}
for(const id of ['greens','meals','eggs'])assert.equal(cold.foodStorage.lots[id].reduce((n,l)=>n+l.n,0),cold.materials[id]);
assert.equal(coolingStatus(cold).occupied,80);
cold.infrastructure.nodes[1].power=0;const deadlines=cold.foodStorage.lots.meals.map(l=>l.expires);cold.time++;coolStoredFood(cold,1);assert.deepEqual(cold.foodStorage.lots.meals.map(l=>l.expires),deadlines);assert.equal(coolingStatus(cold).occupied,0);
const sandbox=fixture();sandbox.s.mode='sandbox';assert.match(kitchenPlan(sandbox.s,sandbox.kitchens[0],PROCESSES,api).reason,/sandbox/);
console.log('PASS kitchen policy scheduling, ingredient priority, reserve floor, whole batches, manual precedence, expiry, capacity, saves, cooling volume, priorities, outages and sandbox');
