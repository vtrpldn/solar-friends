// Grove seedlings, the seedling bench and orchards planted with nursery saplings.
import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,PROCESSES,MATERIALS,tick,queueProduction,productionBlocker,save,restore,restoreWithReason,materialCount,plan,planMaterials,missingMaterials,residentWorkPlan,footprint,placementError,requiredLoads} from '../web/v02/weekend/simulation.js';
import {ensureNaturalLand} from '../web/v02/weekend/natural-resources.js';
import {GATHERING,GROVE_REACH,gatheringStatus} from '../web/v02/weekend/gathering.js';
import {BIOLOGY,GAME_DAY,NURSERY_HEAD_START} from '../web/v02/weekend/biological-production.js';
import {registerWorld,DEFAULT_SETTINGS} from '../web/v02/weekend/world-settings.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {village} from './fixtures.mjs';

const isTree=p=>p.natural&&PROJECTS[p.key].kind==='wild-tree';
const patchesOf=s=>s.projects.filter(p=>p.key==='wild-seedlings');
const treesBeside=(s,p)=>s.projects.filter(q=>isTree(q)&&!q.felled&&Math.abs(q.x-p.x)<=GROVE_REACH&&Math.abs(q.z-p.z)<=GROVE_REACH);

// Every land has seedling patches, each in a free cell beside standing trees.
for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const seed of [42,123,918]){
 const s=createWeekend(seed);s.worldSettings={...DEFAULT_SETTINGS,biome};registerWorld(seed,s.worldSettings);chooseCamp(s,'entrance');ensureNaturalLand(s,PROJECTS);
 const patches=patchesOf(s);
 assert(patches.length>=3,`${biome} ${seed}: ${patches.length} seedling patches`);
 for(const p of patches){
  assert(treesBeside(s,p).length>=2,`${biome} ${seed}: patch stands in a grove`);
  assert(!s.projects.some(q=>q!==p&&q.x<=p.x&&p.x<q.x+footprint(q)[0]&&q.z<=p.z&&p.z<q.z+footprint(q)[1]),`${biome} ${seed}: patch has its own cell`);
 }
 assert(restore(save(s)),'generated land saves');
}
console.log('PASS seedling patches stand beside groves in all three biomes');

// A village saved before seedling patches existed gets them without anything else moving.
{
 const {s}=village({fast:false});ensureNaturalLand(s,PROJECTS);
 const first=JSON.stringify(patchesOf(s).map(p=>[p.x,p.z]));
 s.projects=s.projects.filter(p=>p.key!=='wild-seedlings');delete s.seedlingLandVersion;
 const others=JSON.stringify(s.projects);
 ensureNaturalLand(s,PROJECTS);
 assert.equal(JSON.stringify(s.projects.filter(p=>p.key!=='wild-seedlings')),others,'existing land untouched');
 assert.equal(JSON.stringify(patchesOf(s).map(p=>[p.x,p.z])),first,'same patches as a new land');
 const ids=s.projects.length;ensureNaturalLand(s,PROJECTS);assert.equal(s.projects.length,ids,'added once');
 // Trees already felled raise no seedlings.
 const {s:bare}=village({fast:false});ensureNaturalLand(bare,PROJECTS);
 bare.projects=bare.projects.filter(p=>p.key!=='wild-seedlings');delete bare.seedlingLandVersion;
 for(const p of bare.projects)if(isTree(p))p.felled=true;
 ensureNaturalLand(bare,PROJECTS);assert.equal(patchesOf(bare).length,0);assert(restore(save(bare)));
}
console.log('PASS older villages gain seedling patches from the trees they still have');

// Residents dig seedlings on their own while the village is short, and a felled grove stops giving.
{
 const {s}=village({zero:true,emergencyFood:false});ensureNaturalLand(s,PROJECTS);
 const tree=s.projects.find(isTree);
 const patch={id:s.nextId++,key:'wild-seedlings',x:s.stock.x+4,z:s.stock.z+4,work:1,delivered:0,natural:true};
 const shade={id:s.nextId++,key:tree.key,x:patch.x+1,z:patch.z,work:1,delivered:0,natural:true};
 s.projects.push(patch,shade);syncInfrastructure(s,PROJECTS);
 assert.equal(residentWorkPlan(s,patch).recipe,'gather-wild-seedlings');
 s.materials.tree_starts=4;assert.equal(residentWorkPlan(s,patch).recipe,undefined,'a working stock is enough');
 s.materials.tree_starts=0;
 shade.felled=true;
 assert.match(productionBlocker(s,patch.id,'gather-wild-seedlings'),/felled/);assert.match(gatheringStatus(s,patch),/felled/);
 assert.equal(residentWorkPlan(s,patch).recipe,undefined);
 shade.felled=false;assert.equal(productionBlocker(s,patch.id,'gather-wild-seedlings'),'');
}
console.log('PASS residents gather grove seedlings unasked, and only while the grove stands');

// Four seedlings spend 180 days on the bench and come off as saplings.
let saplingVillage;
{
 let {s,sites:[bench]}=village({zero:true,emergencyFood:false,materials:{food:40},buildings:['seedling-bench']});
 s.naturalLandVersion=s.gatheringLandVersion=s.seedlingLandVersion=1;
 assert.match(productionBlocker(s,bench.id,'saplings'),/tree_starts/);
 assert.equal(residentWorkPlan(s,bench).recipe,undefined,'nothing to pot');
 s.materials.tree_starts=4;
 assert.equal(residentWorkPlan(s,bench).recipe,'saplings','residents pot seedlings unasked');
 assert.equal(queueProduction(s,bench.id,'saplings'),'');assert.equal(materialCount(s,'tree_starts'),0);
 const op=()=>s.operations.find(o=>o.recipe==='saplings');
 for(let i=0;i<40000&&op().phase!=='growing';i++)tick(s,.1);
 assert.equal(op().phase,'growing','potted');
 assert(op().growthRemaining>(BIOLOGY.saplings.days-2)*GAME_DAY&&op().growthRemaining<=BIOLOGY.saplings.days*GAME_DAY);
 s=restore(save(s));assert(s,'growing saplings save');
 assert.equal(materialCount(s,'saplings'),0);
 op().growthRemaining=GAME_DAY/100;
 for(let i=0;i<60000&&!op().done;i++)tick(s,.1);
 assert(op().done,'saplings carried to the stores');assert.equal(materialCount(s,'saplings'),4);
 assert(restore(save(s)));saplingVillage=s;
}
console.log('PASS the seedling bench raises four saplings in 180 days');

// An orchard planned with four saplings in store uses them and bears 180 days sooner.
const firstCrop=s=>{
 const orchard=s.projects.find(p=>p.key==='orchard');orchard.work=PROJECTS.orchard.work;orchard.delivered=requiredLoads(orchard);delete orchard.pendingMaterials;
 for(let i=0;i<60000&&!s.operations?.some(o=>o.recipe==='fruit'&&o.phase==='growing');i++)tick(s,.1);
 const op=s.operations.find(o=>o.recipe==='fruit'&&o.phase==='growing');assert(op,'orchard planted');return op;
};
{
 assert.equal(NURSERY_HEAD_START,180);assert(!MATERIALS.saplings.quantity,'saplings are raised, not bought');
 const s=saplingVillage;Object.assign(s.materials,{earth:8,compost:2,tree_starts:4});s.money=0;
 assert.deepEqual(planMaterials(s,'orchard'),{earth:8,compost:2,saplings:4});assert.deepEqual(missingMaterials(s,'orchard'),[]);
 assert.deepEqual(planMaterials(s,'grove'),PROJECTS.grove.materials,'only orchards take saplings');
 const spot=findSpot(s,'orchard');assert.equal(plan(s,'orchard',spot.x,spot.z),'');
 assert.equal(materialCount(s,'saplings'),0);assert.equal(materialCount(s,'tree_starts'),4,'bought seedlings left alone');
 assert.deepEqual(s.projects.at(-1).billOfMaterials,{earth:8,compost:2,saplings:4});
 const op=firstCrop(s);assert.equal(op.establishmentDays,BIOLOGY.fruit.establish-NURSERY_HEAD_START);
 assert(op.growthRemaining<=(BIOLOGY.fruit.establish-NURSERY_HEAD_START+BIOLOGY.fruit.days)*GAME_DAY);
 const loaded=restoreWithReason(save(s));assert(loaded.state,loaded.reason);
 // Too few saplings: the ordinary bill, and the full establishment.
 const {s:plain}=village({zero:true,emergencyFood:false,materials:{food:40,earth:8,compost:2,tree_starts:4,saplings:3}});
 plain.naturalLandVersion=plain.gatheringLandVersion=plain.seedlingLandVersion=1;
 assert.deepEqual(planMaterials(plain,'orchard'),PROJECTS.orchard.materials);
 const at=findSpot(plain,'orchard');assert.equal(plan(plain,'orchard',at.x,at.z),'');assert.equal(materialCount(plain,'saplings'),3);
 assert.equal(firstCrop(plain).establishmentDays,BIOLOGY.fruit.establish);assert(restore(save(plain)));
 // A save may not claim a head start no nursery gives.
 const forged=JSON.parse(save(plain));forged.operations.find(o=>o.recipe==='fruit').establishmentDays=100;
 assert.equal(restore(JSON.stringify(forged)),null);
}
console.log('PASS orchards planted with nursery saplings establish 180 days sooner');

function findSpot(s,key){
 for(let r=6;r<40;r++)for(let a=0;a<24;a++){
  const x=Math.round(s.stock.x+Math.cos(a/24*Math.PI*2)*r),z=Math.round(s.stock.z+Math.sin(a/24*Math.PI*2)*r);
  if(!placementError(s,key,x,z))return {x,z};
 }
 throw Error(`no room for ${key}`);
}
