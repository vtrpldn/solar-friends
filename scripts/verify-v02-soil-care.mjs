import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {upkeep,upkeepStep} from '../web/v02/weekend/asset-upkeep.js';
const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);
const p={id:s.nextId++,key:'garden',x:s.stock.x+3,z:s.stock.z+3,work:PROJECTS.garden.work,delivered:0,soilFertility:.5};s.projects.push(p);
s.materials.compost=4;upkeep(s).automatic=false;upkeep(s).dailyBudget=0;
upkeepStep(s,PROJECTS,0);assert.equal(s.upkeep.jobs.filter(j=>j.soil).length,1);
// Persisted older gardens may already owe four kg for a 16 m² batch.
// Finish that exact queued obligation before creating the new cultivation beds.
s.upkeep.jobs.find(j=>j.soil).compost=4;
assert(restore(save(s)),'queued soil work saves');
for(let i=0;i<12000&&p.soilFertility<.79;i++)tick(s,.1);
assert(p.soilFertility>=.8,'resident applies compost even with equipment service disabled');
assert.equal(s.materials.compost,0,'four kg consumed for sixteen square meters');assert.equal(s.upkeep.used,0,'compost is not charged as an equipment repair');
assert(restore(save(s)),'completed soil work saves');
for(let i=0;i<100;i++)tick(s,.1);assert.equal(s.materials.compost,0,'no repeated application above threshold');
const bad=JSON.parse(save(s));bad.upkeep.jobs.push({target:p.id,soil:true,compost:-1,work:0,partsPaid:false,done:false});assert.equal(restore(JSON.stringify(bad)),null);
assert(p.cultivation,'beds become available after legacy soil work');
console.log('PASS queued legacy resident compost application, finite consumption, independent equipment budget and save validation');
