import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {plan,cancelProject,restore,save,PROJECTS,PROCESSES,
  productionBlocker,storageCapacity,storedMaterials,queueBedJob,enableFastNavigation,tick} from '../web/v02/weekend/simulation.js';
import {ensureCultivation} from '../web/v02/weekend/cultivation.js';
import {kitchenPlan,foodPolicy} from '../web/v02/weekend/food-policy.js';
import {coolStoredFood} from '../web/v02/weekend/cold-storage.js';
import {ensureFoodStorage} from '../web/v02/weekend/food-storage.js';
import {village as camped} from './fixtures.mjs';

const fixture=async name=>restore(await readFile(new URL('../docs/balance/evidence/2026-11-17-'+name+'-save.json',import.meta.url),'utf8'));
const village=await fixture('final-catalog');
const kitchen=village.projects.find(site=>PROJECTS[site.key].kind==='kitchen');
const garden=village.projects.find(site=>site.id===106);
foodPolicy(village).automatic=true;
const api={blocker:productionBlocker,stored:storedMaterials,capacity:storageCapacity};
assert.equal(kitchenPlan(village,kitchen,PROCESSES,api).recipe,'meals');
ensureCultivation(village,garden);
assert.equal(queueBedJob(village,garden.id,0,'prepare'),'');
assert.equal(kitchenPlan(village,kitchen,PROCESSES,api).recipe,'meals','preparing a bed has no incoming harvest');

const {s:camp}=camped({fast:false});
const cash=camp.money;
assert.equal(plan(camp,'compost',29,-10),'');
assert.equal(camp.trip.phase,'boarding');
assert.equal(cancelProject(camp,camp.projects.at(-1).id),'');
assert.equal(camp.money,cash);
assert.equal(camp.opening.townTrips,0);
assert.equal(camp.upkeep?.vehicles[0].km||0,0);
assert.ok(restore(save(camp)));

const fridge={time:0,materials:{eggs:801},infrastructure:{nodes:{1:{coldStorage:true,enabled:true,power:1}}}};
ensureFoodStorage(fridge);
for(let i=0;i<1000;i++){fridge.time+=.1;coolStoredFood(fridge,.1);}
assert.equal(fridge.foodStorage.lots.eggs.length,2,'overflow keeps a stable cold allocation');
assert.equal(fridge.foodStorage.lots.eggs.find(l=>l.chilled).n,800);

const sanitation=await fixture('starved-catalog');
enableFastNavigation(sanitation);
for(let i=0;i<100;i++)tick(sanitation,.1);
assert(sanitation.operations.some(o=>o.site===100 && o.water?.service),'full sewage tank requests service independently of greywater');
console.log('PASS automatic cooking with pending bed work, parked pickup cancellation, fridge overflow and full sewage service');
