import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {upkeep,upkeepStep} from '../web/v02/weekend/asset-upkeep.js';
import {GAME_DAY} from '../web/v02/weekend/biological-production.js';
const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);
const p={id:s.nextId++,key:'coop',x:s.stock.x+4,z:s.stock.z+4,work:PROJECTS.coop.work,delivered:0};s.projects.push(p);s.materials.fodder=3;
const n=syncInfrastructure(s,PROJECTS).nodes[p.id];n.water[0]=6;
upkeep(s).automatic=false; // Caring for living animals is independent of equipment upkeep.
for(let i=0;i<6000&&!(p.animalCare?.feed>0);i++)tick(s,.1);
assert(p.careUntil>s.time);assert.equal(s.materials.fodder,2);assert(s.upkeep.jobs.some(j=>j.target===p.id&&j.waterPaid),'care consumed its drinking water before completion');
assert(restore(save(s)),'care and reserved supplies survive save');
const healthy=p.animalHealth;const elapsed=p.careUntil-s.time+GAME_DAY;s.time+=elapsed;upkeepStep(s,PROJECTS,elapsed);
assert(p.animalHealth<healthy,'neglect reduces health even without a production order');
assert(s.upkeep.jobs.some(j=>j.care==='coop'),'care automatically queued');
console.log('PASS resident animal care, feed and water consumption, idle-animal neglect, automatic scheduling and save');

// A full pantry must not suppress collection of produce that could spoil.
const flock=createWeekend(42);chooseCamp(flock,'entrance');enableFastNavigation(flock);
flock.foodReserveDays=0;
const henhouse={...p,id:flock.nextId++,animalCare:undefined,careUntil:flock.time+GAME_DAY*3};
flock.projects.push(henhouse);
for(let i=0;i<40000&&!henhouse.animalCare?.collected;i++)tick(flock,.1);
assert(henhouse.animalCare?.collected>0,'residents collect eggs without an order or pantry shortage');

const hungry=createWeekend(42);chooseCamp(hungry,'entrance');enableFastNavigation(hungry);
hungry.foodReserveDays=0;
const coop={id:hungry.nextId++,key:'coop',x:hungry.stock.x+4,z:hungry.stock.z+4,work:PROJECTS.coop.work,delivered:0};
hungry.projects.push(coop);hungry.materials.fodder=0;
syncInfrastructure(hungry,PROJECTS).nodes[coop.id].water[0]=6;
for(let i=0;i<32000&&!(coop.animalCare?.feed>0);i++)tick(hungry,.1);
assert(hungry.operations.some(op=>op.recipe==='gather-wild-forage'&&op.done),'residents gather and deliver missing fodder');
assert(coop.animalCare.feed>0,'residents feed the flock with gathered fodder');
assert(restore(save(hungry)));
