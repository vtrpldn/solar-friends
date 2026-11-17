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
