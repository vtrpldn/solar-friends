import assert from 'node:assert/strict';
import {createWeekend,PROJECTS,save,restore} from '../web/v02/weekend/simulation.js';
import {ensureNaturalLand} from '../web/v02/weekend/natural-resources.js';
import {registerWorld,DEFAULT_SETTINGS,BIOMES} from '../web/v02/weekend/world-settings.js';
import {riverBankAt} from '../web/v02/weekend/river-layout.js';
import {accessRoadAt} from '../web/v02/weekend/road-layout.js';
import {CELL_MIN,CELL_MAX} from '../web/v02/weekend/map-size.js';
let maps=0;
for(const biome of Object.keys(BIOMES))for(const resources of ['sparse','balanced','rich'])for(const seed of [1,17,972341,4294967295]){
 registerWorld(seed,{...DEFAULT_SETTINGS,biome,resources});
 const s=createWeekend(seed);ensureNaturalLand(s,PROJECTS);
 const again=createWeekend(seed);ensureNaturalLand(again,PROJECTS);assert.deepEqual(s.projects,again.projects);
 const trees=s.projects.filter(p=>PROJECTS[p.key].kind==='wild-tree');
 assert(trees.length>=40,'enough harvestable trees');
 const clustered=trees.filter(p=>trees.some(q=>p!==q&&Math.hypot(p.x-q.x,p.z-q.z)<6));
 assert(clustered.length/trees.length>.6,'most trees belong to groves');
 for(const key of ['supply-2','supply-3']){
  const deposits=s.projects.filter(p=>p.key===key&&p.natural);
  assert.equal(deposits.length,4);
  assert(deposits.some(p=>Math.hypot(p.x-s.stock.x,p.z-s.stock.z)<28),'nearby deposit');
 }
 for(const p of s.projects.filter(p=>p.natural)){
  const [w,d]=PROJECTS[p.key].size;
  assert(p.x>=CELL_MIN+3&&p.z>=CELL_MIN+3&&p.x+w<=CELL_MAX-3&&p.z+d<=CELL_MAX-3);
  assert(Math.hypot(p.x-s.stock.x,p.z-s.stock.z)>=9);
  for(let dx=-1;dx<=w;dx++)for(let dz=-1;dz<=d;dz++){
   assert(!riverBankAt(p.x+dx,p.z+dz,1,seed));
   assert(!accessRoadAt(p.x+dx,p.z+dz,2));
  }
  if(PROJECTS[p.key].kind==='wild-tree')assert(BIOMES[biome].trees.includes(p.key.slice(5)));
 }
 const loaded=restore(save(s));assert(loaded);const before=JSON.stringify(loaded.projects);
 ensureNaturalLand(loaded,PROJECTS);assert.equal(JSON.stringify(loaded.projects),before,'saved placement remains unchanged');
 maps++;
}
console.log(`PASS ${maps} maps: groves, biome species, nearby deposits, clearances, determinism and saved placement`);
