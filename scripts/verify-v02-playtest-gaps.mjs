import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,save,restore,supplyRun,sellMaterial,MATERIALS,tick,enableFastNavigation,PROJECTS} from '../web/v02/weekend/simulation.js';
import {foodChange,foodPortions,nextMeal,eatMeal,ensureFoodStorage} from '../web/v02/weekend/food-storage.js';
import {loadExports,transportCost,cargoSize} from '../web/v02/weekend/physical-trade.js';
import {biologicalStep,biologyLabel,GAME_DAY,validBiology} from '../web/v02/weekend/biological-production.js';
const fresh=()=>{const s=createWeekend(42);chooseCamp(s,'entrance');return s;};
const s=fresh();ensureFoodStorage(s);
foodChange(s,'eggs',8);foodChange(s,'milk',2);
s.foodStorage.lots.eggs[0].expires=100;
const count=foodPortions(s),oldFood=s.materials.food;
assert.equal(nextMeal(s).id,'eggs');assert(eatMeal(s));assert.equal(s.materials.eggs,4);assert.equal(s.materials.food,oldFood);assert.equal(foodPortions(s),count-1);
assert(restore(save(s)),'real meal consumption retains valid lots and save');
foodChange(s,'food',-s.materials.food);foodChange(s,'meals',-s.materials.meals);
assert(eatMeal(s));assert(eatMeal(s));assert.equal(foodPortions(s),0);assert(!eatMeal(s));assert.equal(s.materials.eggs,0);assert.equal(s.materials.milk,0);
assert(restore(save(s)));
const trip=fresh();trip.materials.stone=16;assert(sellMaterial(trip,'stone'));assert(supplyRun(trip,'stone',null,true));const cash=trip.money;const person=trip.trip.person;
assert(supplyRun(trip,'food'));assert.equal(trip.money,cash-MATERIALS.food.price);assert.equal(trip.trip.person,person);assert(!trip.secondTrip);assert(!trip.trip.saleOnly);assert(restore(save(trip)));
assert.equal(trip.finances.entries.filter(e=>e.category==='transport').reduce((n,e)=>n-e.amount,0),transportCost(trip),'one fuel charge');
assert(sellMaterial(trip,'stone'));loadExports(trip,trip.trip);const loaded=trip.trip.exports.length;loadExports(trip,trip.trip);assert.equal(trip.trip.exports.length,loaded,'loading is idempotent');
const cargo={};for(const id of trip.trip.exports){const o=trip.trade.orders.find(o=>o.id===id);cargo[o.material]=(cargo[o.material]||0)+o.quantity;}assert(cargoSize(cargo).kg<=350);assert(restore(save(trip)));
const grow=policy=>({time:0,rain:false,projects:[{id:1,soilMoisture:.75,soilFertility:1,irrigationPolicy:policy}],operations:[{site:1,recipe:'baby_greens',phase:'growing',growthRemaining:21*GAME_DAY,planted:true}]});
const totals={};for(const policy of ['balanced','conserve','rainfed']){const crop=grow(policy);let water=0;for(let i=0;i<GAME_DAY;i++)biologicalStep(crop,1,(_s,_id,n)=>{water+=n;return true;});totals[policy]=water;assert(validBiology(crop,{}));if(policy==='rainfed')assert(crop.projects[0].soilMoisture<.2);}
assert(totals.balanced>totals.conserve);assert.equal(totals.rainfed,0);assert.equal(biologyLabel('eggs'),'Next collection');assert.equal(biologyLabel('milk'),'Next collection');
console.log('PASS oldest-food consumption, eggs/milk portions, stock and save conservation, shared return-trip purchase, cargo limits, irrigation choices and animal labels');

const delivery=fresh();enableFastNavigation(delivery);delivery.emergencyFood=false;delivery.materials.stone=8;
assert(sellMaterial(delivery,'stone'));assert(supplyRun(delivery,'stone',null,true));assert(supplyRun(delivery,'food'));
const before=delivery.materials.food;
for(const r of delivery.people){r.needs={hunger:100,bladder:100,bowels:100,hygiene:100,social:100,fun:100};}
for(let i=0;i<15000&&delivery.trip;i++)tick(delivery,.1);
assert(!delivery.trip,'shared trip physically returns and unloads');assert.equal(delivery.materials.food,before+MATERIALS.food.quantity);assert.equal(delivery.trade.orders[0].status,'sold');assert(restore(save(delivery)));
const {chooseNeed,advanceNeed}=await import('../web/v02/weekend/resident-needs.js');
const eater=fresh();syncInfrastructure(eater,PROJECTS);foodChange(eater,'food',-eater.materials.food);foodChange(eater,'meals',-eater.materials.meals);foodChange(eater,'eggs',4);
const resident=eater.people[0];resident.energy=80;resident.needs={hunger:5,bladder:100,bowels:100,hygiene:100,social:100,fun:100};
chooseNeed(eater,resident,0,{groundSpot:()=>({x:resident.x,z:resident.z})});assert.equal(resident.needTask.kind,'hunger');
advanceNeed(eater,resident,30,{go:()=>true});assert.equal(resident.needs.hunger,90);assert.equal(eater.materials.eggs,0);
console.log('PASS physical shared-trip unload and resident egg-meal autonomy');
