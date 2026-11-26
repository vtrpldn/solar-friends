import assert from 'node:assert/strict';
import {createWeekend,PROCESSES,MATERIALS,save,restore,materialCount,sellMaterial,supplyRun} from '../web/v02/weekend/simulation.js';
import {ensureFoodStorage,foodChange,foodStorageStep,validFoodStorage,returnUnsoldFood,freshLots} from '../web/v02/weekend/food-storage.js';
import {cancelExport,loadExports,settleExports} from '../web/v02/weekend/physical-trade.js';
import {transact} from '../web/v02/weekend/finances.js';
import {village} from './fixtures.mjs';
const fresh=()=>{const {s}=village({fast:false});ensureFoodStorage(s);return s;};
const s=fresh();const starting=s.materials.food;const expiry=s.foodStorage.lots.food[0].expires;
s.time+=500;foodChange(s,'food',12);const removed=foodChange(s,'food',-2);assert.equal(removed[0].expires,expiry,'oldest consumed first');
s.time=expiry;foodStorageStep(s,PROCESSES);assert.equal(s.materials.food,12,'newer batch survives');assert.equal(s.foodStorage.spoiled.food,starting-2);const scraps=s.materials.scraps;foodStorageStep(s,PROCESSES);assert.equal(s.materials.scraps,scraps,'spoilage counted once');assert(validFoodStorage(s));assert(restore(save(s)));
const sale=fresh();foodChange(sale,'food',24);assert(sellMaterial(sale,'food'));const order=sale.trade.orders.at(-1);const age=order.foodLots[0].expires;
sale.time+=100;assert(cancelExport(sale,order.id,foodChange));assert.equal(sale.foodStorage.lots.food[0].expires,age,'cancellation preserves age');assert(validFoodStorage(sale));
assert(sellMaterial(sale,'food'));const live=sale.trade.orders.at(-1);const trip={};loadExports(sale,trip);sale.trip=trip;const cash=sale.money;
sale.time=live.foodLots[0].expires;foodStorageStep(sale,PROCESSES);assert.equal(live.status,'spoiled');settleExports(sale,trip,transact);assert.equal(sale.money,cash,'spoiled goods cannot earn money');returnUnsoldFood(sale,trip);assert(validFoodStorage(sale));
const partial=fresh();foodChange(partial,'food',-partial.materials.food);foodChange(partial,'food',6);partial.time=500;foodChange(partial,'food',6);assert(sellMaterial(partial,'food'));const delivery={};loadExports(partial,delivery);partial.trip=delivery;partial.time=9600;foodStorageStep(partial,PROCESSES);assert.equal(partial.materials.food,0,'usable cargo cannot teleport home');returnUnsoldFood(partial,delivery);assert.equal(partial.materials.food,6);assert.equal(partial.foodStorage.lots.food[0].expires,10100);assert(validFoodStorage(partial));
const cooking=fresh();const input=foodChange(cooking,'food',-4);const op={recipe:'meals',phase:'process',foodInput:{food:input},work:0,done:false};cooking.operations=[op];cooking.time=input[0].expires;foodStorageStep(cooking,PROCESSES);assert.equal(op.phase,'return');assert.equal(op.returnItems.food,0);assert.equal(cooking.materials.meals,0,'rotten ingredients do not become fresh meals');assert(validFoodStorage(cooking,PROCESSES,MATERIALS));
const carrying=fresh();const mealLots=freshLots(carrying,'meals',4);carrying.operations=[{recipe:'meals',phase:'return',foodOutput:{meals:mealLots},work:25,done:false}];carrying.time=mealLots[0].expires;foodStorageStep(carrying,PROCESSES);assert.equal(carrying.operations[0].returnItems.meals,0,'finished food ages in transit');assert.equal(carrying.operations[0].returnItems.scraps,1,'other output is preserved');
const corrupt=JSON.parse(save(s));corrupt.foodStorage.lots.food[0].n++;assert.equal(restore(JSON.stringify(corrupt)),null,'ledger and inventory must reconcile');
const legacy=createWeekend(42);assert.equal(legacy.foodStorage,undefined);assert(restore(save(legacy)),'older saves without ages remain readable');
const sandbox=fresh();sandbox.mode='sandbox';sandbox.time=1e6;const stock=sandbox.materials.food;foodStorageStep(sandbox,PROCESSES);assert.equal(sandbox.materials.food,stock);
console.log('PASS FIFO consumption, exact expiry, cancellation, rejected spoiled exports, physical returns, cooking/carried spoilage, saves and sandbox');

const fraudulent=fresh();assert(sellMaterial(fraudulent,'food'));fraudulent.trade.orders[0].foodLots[0].n+=10;
assert.equal(restore(save(fraudulent)),null,'refundable export lots cannot exceed reserved quantity');
const run=step=>{const a={time:0,materials:{food:12,meals:4,eggs:6,milk:2,scraps:0}};ensureFoodStorage(a);while(a.time<22400){a.time=Math.min(22400,a.time+step);foodStorageStep(a,PROCESSES);}return a;};
const fine=run(1),coarse=run(22400);
assert.deepEqual(fine.materialLedger.net,coarse.materialLedger.net,'recorded quantities agree regardless of observation intervals');
delete fine.materialLedger;delete coarse.materialLedger;
assert.deepEqual(fine,coarse,'spoilage follows elapsed simulation time, not tick count');
console.log('PASS reservation tampering rejected and expiry is independent of observation step');

const midTrip=fresh();assert(sellMaterial(midTrip,'food'));assert(supplyRun(midTrip,'wood'));midTrip.time=9600;foodStorageStep(midTrip,PROCESSES,MATERIALS);
assert(restore(save(midTrip)),'spoiled cargo and return ownership survive an actual trip save');
midTrip.materials.bamboo=24;
for(let i=0;i<120;i++){assert(sellMaterial(midTrip,'bamboo'));assert(cancelExport(midTrip,midTrip.trade.orders.at(-1).id,foodChange));}
assert(restore(save(midTrip)),'history pruning preserves current trip order references');
console.log('PASS spoiled cargo persistence and trade-history pruning during an active trip');
const eggsOnly={time:0,materials:{food:0,meals:0,eggs:12,milk:0,scraps:0}};ensureFoodStorage(eggsOnly);eggsOnly.time=7*3200;foodStorageStep(eggsOnly,PROCESSES);assert.equal(eggsOnly.materials.scraps,0);assert(Math.abs(eggsOnly.foodStorage.wasteRemainderKg-.72)<1e-8,'twelve eggs make 0.72 kg waste, not twelve kilograms');assert(validFoodStorage(eggsOnly));
console.log('PASS spoiled egg mass cannot amplify compost inputs');
