import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,PROCESSES,tick,queueProduction,productionBlocker,save,restore,enableFastNavigation,materialCount,plan,removeProject} from '../web/v02/weekend/simulation.js';
import {ensureNaturalLand} from '../web/v02/weekend/natural-resources.js';
import {GATHERING} from '../web/v02/weekend/gathering.js';
import {registerWorld,DEFAULT_SETTINGS} from '../web/v02/weekend/world-settings.js';
for(const biome of ['mata-atlantica','cerrado','caatinga']){
 for(const seed of [42,123,918]){
  const s=createWeekend(seed);s.worldSettings={...DEFAULT_SETTINGS,biome};registerWorld(seed,s.worldSettings);chooseCamp(s,'entrance');ensureNaturalLand(s,PROJECTS);
  const patches=s.projects.filter(p=>GATHERING[p.key]);assert(patches.length>=6);
  for(const [key,d]of Object.entries(GATHERING))assert.equal(patches.some(p=>p.key===key),d.biomes.includes(biome),`${biome}: ${key}`);
  const ids=s.projects.map(p=>p.id);ensureNaturalLand(s,PROJECTS);assert.deepEqual(s.projects.map(p=>p.id),ids,'generation is idempotent');
  assert(restore(save(s)),'generated patches persist');assert(plan(s,'wild-fruit',10,10),'wild patches cannot be built');assert(removeProject(s,patches[0].id,'demolish'),'natural patches cannot be demolished');
 }
}
// Upgrade an established layout without moving or replacing any existing object.
const old=createWeekend(42);chooseCamp(old,'entrance');ensureNaturalLand(old,PROJECTS);old.projects=old.projects.filter(p=>!GATHERING[p.key]);delete old.gatheringLandVersion;
const originals=JSON.stringify(old.projects);ensureNaturalLand(old,PROJECTS);assert.equal(JSON.stringify(old.projects.filter(p=>!GATHERING[p.key])),originals);assert(old.projects.some(p=>GATHERING[p.key]));
// Complete each job through the ordinary simulation, including multi-load hauling.
for(const [key,d] of Object.entries(GATHERING)){
 let s=createWeekend(42);chooseCamp(s,'entrance');s.naturalLandVersion=s.gatheringLandVersion=1;s.emergencyFood=false;s.rainSeen=s.rainResolved=true;enableFastNavigation(s);
 let p={id:s.nextId++,key,x:s.stock.x+4,z:s.stock.z+4,work:1,delivered:0,natural:true};s.projects.push(p);
 const recipe=`gather-${key}`,resource=Object.keys(d.output)[0],before=materialCount(s,resource);assert.equal(queueProduction(s,p.id,recipe),'');assert(productionBlocker(s,p.id,recipe),'duplicate job prevented');
 let carried=false,reloaded=false;
 for(let i=0;i<20000&&!s.operations[0].done;i++){tick(s,.1);if(s.people.some(r=>r.cargo)){carried=true;if(!reloaded){s=restore(save(s));assert(s,'mid-haul save valid');enableFastNavigation(s);reloaded=true;}}}
 p=s.projects.find(site=>site.id===p.id);assert(s.operations[0].done,`${key} job completes`);assert(carried,`${key} physically carried`);assert.equal(materialCount(s,resource),before+d.output[resource]);assert(restore(save(s)));
 if(d.renew){assert(productionBlocker(s,p.id,recipe).includes('Recovering'));s.time=p.readyAt;assert.equal(productionBlocker(s,p.id,recipe),'');}
 else{p.extracted=d.gatherLimit;assert(productionBlocker(s,p.id,recipe).includes('gathered out'));}
}
console.log('PASS three-biome generation, additive old-save migration, finite gathering, regrowth cooldown, resident labor, physical hauling, duplicate prevention and save/load');

const invalid=JSON.parse(save(old));const patch=invalid.projects.find(p=>GATHERING[p.key]);patch.extracted=-1;assert.equal(restore(JSON.stringify(invalid)),null);
patch.extracted=0;patch.readyAt=Infinity;assert.equal(restore(JSON.stringify(invalid)),null);
console.log('PASS actual mid-haul reload continuation and invalid gathering state rejection');
