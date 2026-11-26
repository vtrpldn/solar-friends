import assert from 'node:assert/strict';
import {PROJECTS,PROCESSES,queueProduction,tick,save,restore,enableFastNavigation,MATERIALS,sellMaterial} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {foodChange,freshLots,foodStorageStep,ensureFoodStorage,foodStorageText} from '../web/v02/weekend/food-storage.js';
import {recipeBalance} from '../web/v02/weekend/production-accounting.js';
import {cancelExport} from '../web/v02/weekend/physical-trade.js';
import {village} from './fixtures.mjs';
const recipe=PROCESSES.preserve_meals;
assert(recipe.work>PROCESSES.meals.work);assert(recipe.input.food>PROCESSES.meals.input.food);assert.deepEqual(recipeBalance('preserve_meals',recipe),{inputKg:8,outputKg:6,lossKg:2,sink:'Drying moisture losses'});
let {s}=village();s.rainSeen=s.rainResolved=true;
// Isolated production fixture; these supplies are not a bootstrap balance claim.
const kitchen={id:s.nextId++,key:'kitchen',x:s.stock.x+3,z:s.stock.z+3,rotation:0,work:PROJECTS.kitchen.work,delivered:0};s.projects.push(kitchen);
const sys=syncInfrastructure(s,PROJECTS);sys.nodes[kitchen.id].water[0]=sys.nodes[kitchen.id].capacity[0];sys.biogas=10;
const ingredients=s.materials.food;assert.equal(queueProduction(s,kitchen.id,'preserve_meals'),'');assert.equal(s.materials.food,ingredients-6);
let outputSeen=false,finished=false;
for(let i=0;i<16000;i++){
 tick(s,.1);const op=s.operations.find(o=>o.recipe==='preserve_meals');
 if(!outputSeen&&op.phase==='return'){
  outputSeen=true;assert.equal(op.foodOutput.meals[0].preserved,true);assert(Math.abs(op.foodOutput.meals[0].expires-s.time-32000)<1e-6);
  s=restore(save(s));assert(s,'preserved output survives mid-carry restore');enableFastNavigation(s);
 }
 if(op.done){finished=true;break;}
}
assert(outputSeen&&finished,'resident prepares and delivers provisions');
assert.equal(s.foodStorage.lots.meals.filter(l=>l.preserved).reduce((n,l)=>n+l.n,0),4);
assert(foodStorageText(s).includes('4 of the meals'));
assert(restore(save(s)));
// Mixed fresh/preserved meals age independently and oldest lots are used first.
const mixed={time:0,materials:{food:0,meals:0,eggs:0,milk:0,scraps:0}};ensureFoodStorage(mixed);
foodChange(mixed,'meals',12,freshLots(mixed,'meals',12,recipe));foodChange(mixed,'meals',4);
assert(!foodChange(mixed,'meals',-2)[0].preserved,'fresh meals used before long-lived provisions');
mixed.time=6400;foodStorageStep(mixed,PROCESSES);assert.equal(mixed.materials.meals,12);assert.equal(mixed.foodStorage.spoiled.meals,2);
mixed.time=32000;foodStorageStep(mixed,PROCESSES);assert.equal(mixed.materials.meals,0);assert.equal(mixed.foodStorage.spoiled.meals,14);
// Sale cancellation retains both preservation identity and the original deadline.
const {s:trade}=village({fast:false});ensureFoodStorage(trade);foodChange(trade,'meals',-trade.materials.meals);foodChange(trade,'meals',12,freshLots(trade,'meals',12,recipe));
assert(sellMaterial(trade,'meals'));trade.time=100;assert(cancelExport(trade,trade.trade.orders[0].id,foodChange));assert.equal(trade.foodStorage.lots.meals[0].expires,32000);assert.equal(trade.foodStorage.lots.meals[0].preserved,true);assert(restore(save(trade)));
console.log('PASS preservation costs, mass balance, actual kitchen work, mid-carry save, mixed-lot expiry, FIFO and trade cancellation');
