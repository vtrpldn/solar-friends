import assert from 'node:assert/strict';
import {pantryForecast,productionStock} from '../web/v02/weekend/food-planning.js';
import {ensureFoodStorage,foodChange,freshLots} from '../web/v02/weekend/food-storage.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {createWeekend,chooseCamp,tick,enableFastNavigation,PROCESSES,PROJECTS,save,restore} from '../web/v02/weekend/simulation.js';
const pantry=()=>({time:0,people:[{},{}],materials:{food:0,meals:0,eggs:0,milk:0},operations:[]});
const s=pantry();ensureFoodStorage(s);
foodChange(s,'meals',20,[{n:20,expires:800}]);
const before=JSON.stringify(s);
assert.deepEqual(pantryForecast(s,2),{portions:20,target:12,served:2,shortfall:10,days:1/3,atRisk:18});
assert.equal(JSON.stringify(s),before,'forecast must not consume or age real stock');
foodChange(s,'meals',8,freshLots(s,'meals',8,PROCESSES.preserve_meals));
assert.equal(pantryForecast(s,2).shortfall,2);
assert.equal(productionStock(s,PROCESSES.meals,PROCESSES),20);
assert.equal(productionStock(s,PROCESSES.preserve_meals,PROCESSES),8);
s.operations.push({recipe:'preserve_meals',phase:'return',haulRemaining:{meals:2}});
assert.equal(productionStock(s,PROCESSES.preserve_meals,PROCESSES),10);
assert.equal(productionStock(s,PROCESSES.meals,PROCESSES),20);
assert.equal(pantryForecast(s,0).target,0);
const eggs=pantry();ensureFoodStorage(eggs);foodChange(eggs,'eggs',8,[{n:2,expires:100},{n:6,expires:6400}]);
assert.equal(pantryForecast(eggs,1).served,2,'whole portions can span lots');
const village=createWeekend(42);chooseCamp(village,'entrance');enableFastNavigation(village);ensureFoodStorage(village);
for(const id of ['food','meals','eggs','milk'])foodChange(village,id,-village.materials[id]);
foodChange(village,'food',100,[{n:100,expires:1}]);
tick(village,.1);assert(village.trip,'shopping responds to an expiring pantry before it becomes empty');
assert(restore(save(village)),'planning remains compatible with save validation');
console.log('PASS expiry-aware reserves, no forecast mutation, mixed lots, separate production pools, partial hauls and live replenishment');

for(const [repeat,stockRecipe] of [['preserve_meals',null],['meals',PROCESSES.preserve_meals]]){
 const v=createWeekend(42);chooseCamp(v,'entrance');enableFastNavigation(v);ensureFoodStorage(v);
 foodChange(v,'meals',-v.materials.meals);
 foodChange(v,'meals',40,freshLots(v,'meals',40,stockRecipe));
 const kitchen={id:v.nextId++,key:'kitchen',x:v.stock.x+3,z:v.stock.z+3,rotation:0,work:PROJECTS.kitchen.work,delivered:0,repeat,stockTarget:8};v.projects.push(kitchen);
 const sys=syncInfrastructure(v,PROJECTS);sys.nodes[kitchen.id].water[0]=sys.nodes[kitchen.id].capacity[0];sys.biogas=10;
 tick(v,.1);
 assert(!v.operations?.some(o=>o.recipe===repeat&&!o.done),`legacy ${repeat} must not restart automatically`);
}
console.log('PASS generic repeating recipes stay removed');
{
 // Surplus is what cannot be eaten before it spoils, at three portions a person a day.
 const {foodSurplus}=await import('../web/v02/weekend/food-planning.js');
 const {createWeekend:fresh,chooseCamp:camp,tick:step,sellFoodSurplus,PROJECTS:defs}=await import('../web/v02/weekend/simulation.js');
 const DAY=3200,lots=o=>({greens:[],beans:[],corn:[],food:[],meals:[],eggs:[],milk:[],...o});
 const village=o=>({time:0,people:Array(5).fill({}),materials:{},foodStorage:{version:1,lots:lots(o),spoiled:{}}});
 // Five people eat 15 portions a day: 30 two-day meals are all eaten, 40 leave 10.
 assert.deepEqual(foodSurplus(village({meals:[{n:30,expires:2*DAY}]})),{});
 assert.deepEqual(foodSurplus(village({meals:[{n:40,expires:2*DAY}]})),{meals:10});
 // Earlier batches use up the appetite that later ones would need.
 assert.deepEqual(foodSurplus(village({meals:[{n:30,expires:2*DAY}],food:[{n:30,expires:3*DAY}]})),{food:15});
 // A crop nobody can cook is all surplus; with a kitchen it feeds the village first.
 assert.deepEqual(foodSurplus(village({greens:[{n:100,expires:3*DAY}]})),{greens:100});
 assert.deepEqual(foodSurplus(village({greens:[{n:100,expires:3*DAY}]}),{greens:{size:1,keepDays:1}}),{greens:40});
 // Left unattended, residents set the surplus aside for town and keep the rest.
 const s=fresh();s.arrivalElapsed=17;camp(s,'clearing');for(let i=0;i<5;i++)step(s,.1);
 for(const id of Object.keys(s.materials))if(s.foodStorage.lots[id]){s.materials[id]=0;s.foodStorage.lots[id]=[];}
 s.materials.greens=60;s.foodStorage.lots.greens=[{n:60,expires:s.time+3*DAY}];
 s.materials.meals=20;s.foodStorage.lots.meals=[{n:20,expires:s.time+2*DAY}];
 sellFoodSurplus(s);
 const orders=s.trade.orders.filter(o=>o.surplus);
 assert.equal(orders.reduce((n,o)=>n+o.quantity,0),60,'uncookable greens are all set aside');
 assert(orders.every(o=>o.material==='greens'&&o.status==='queued'));
 assert.equal(s.materials.greens,0);assert.equal(s.materials.meals,20,'food the village can eat stays');
 assert(s.log.some(line=>/more than the village can eat before it spoils/.test(line)));
 sellFoodSurplus(s);assert.equal(s.trade.orders.filter(o=>o.surplus).length,orders.length,'nothing is sold twice');
 // Turning automatic food management off leaves the decision to the player.
 const manual=fresh();manual.arrivalElapsed=17;camp(manual,'clearing');for(let i=0;i<5;i++)step(manual,.1);
 manual.foodPolicy={version:1,automatic:false,freshDays:1,provisionDays:2,coolingPriority:'expiry'};
 manual.materials.greens=60;manual.foodStorage.lots.greens=[{n:60,expires:manual.time+3*DAY}];
 sellFoodSurplus(manual);assert.equal(manual.trade?.orders?.length||0,0);
 console.log('PASS surplus is what spoils before it can be eaten; residents sell it and keep their own food');
}
