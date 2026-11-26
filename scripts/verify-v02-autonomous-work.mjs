import assert from 'node:assert/strict';
import {createWeekend,PROJECTS,PROCESSES,productionBlocker,storedMaterials,storageCapacity,materialCount,residentWorkPlan,buildingOperatingStatus,save,restore} from '../web/v02/weekend/simulation.js';
import {autonomousWorkPlan,startAutonomousWork,workNeed,WORKING_BATCHES,SPARE_BATCHES,MAX_WALK} from '../web/v02/weekend/autonomous-work.js';
import {foodPolicy} from '../web/v02/weekend/food-policy.js';
import {foodChange} from '../web/v02/weekend/food-storage.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {equipmentState,EQUIPMENT_LIFE} from '../web/v02/weekend/equipment.js';
import * as fixtures from './fixtures.mjs';
const {advance}=fixtures;

function village(...keys){
 const {s}=fixtures.village({emergencyFood:false});s.rainSeen=s.rainResolved=true;
 const sites=keys.map((key,i)=>{const p={id:s.nextId++,key,x:s.stock.x+4+i*6,z:s.stock.z+4,rotation:0,work:PROJECTS[key].work,delivered:0};s.projects.push(p);return p;});
 syncInfrastructure(s,PROJECTS);return {s,sites};
}
const key=kind=>Object.keys(PROJECTS).find(k=>PROJECTS[k].kind===kind);
const pending=(s,recipe)=>s.operations?.filter(o=>!o.done&&o.recipe===recipe).length||0;
const api={blocker:productionBlocker,stored:storedMaterials,capacity:storageCapacity,count:materialCount};

assert.equal(foodPolicy(createWeekend(1)).automatic,true,'residents cook for themselves by default');
{
 const {s:old}=fixtures.village({seed:1,fast:false});foodPolicy(old).automatic=false;delete old.autonomy;
 assert.equal(restore(save(old)).foodPolicy.automatic,true,'older saves gain automatic cooking once');
 const {s:chosen}=fixtures.village({seed:1,fast:false});foodPolicy(chosen).automatic=false;
 assert.equal(restore(save(chosen)).foodPolicy.automatic,false,'a later player choice survives reload');
}
{
 const {s,sites:[compost]}=village(key('compost'));
 assert.match(residentWorkPlan(s,compost).reason,/Missing 4 scraps/,'no inputs, no job');
 foodChange(s,'scraps',12);
 assert.equal(residentWorkPlan(s,compost).recipe,'compost');
 advance(s,{seconds:30,dt:1,until:()=>pending(s,'compost')});
 assert.equal(pending(s,'compost'),1,'residents start composting unprompted');
 assert.equal(s.materials.scraps,8,'inputs are charged once');
 assert.match(buildingOperatingStatus(s,compost).state,/Preparing|Working|Waiting|Composting|Developing/);
 advance(s,{seconds:30,dt:1});
 assert.equal(pending(s,'compost'),1,'one job per site');
}
{
 const {s,sites:[shop]}=village(key('supply-5'));
 const batch=PROCESSES.saw_timber.output.wood;s.wood=0;foodChange(s,'logs',60);
 assert.equal(residentWorkPlan(s,shop).recipe,'saw_timber');
 s.wood=batch*WORKING_BATCHES;
 assert.notEqual(residentWorkPlan(s,shop).recipe,'saw_timber','a working stock is enough');
 // With two residents at leisure and nothing else to make, they stock up further, one job at a time.
 const queued=[],spare={...api,queue:(village,site,recipe)=>{queued.push(recipe);village.operations.push({id:-queued.length,site,recipe,auto:true,done:false});return '';}};
 s.operations??=[];const only={saw_timber:PROCESSES.saw_timber};
 for(const r of s.people){r.action='produce';r.operation=null;r.energy=80;}
 startAutonomousWork(s,only,PROJECTS,spare);
 assert.deepEqual(queued,[],'busy residents keep to the working stock');
 s.people[0].action=s.people[1].action='relax';
 startAutonomousWork(s,only,PROJECTS,spare);
 assert.deepEqual(queued,['saw_timber'],'residents at leisure build a deeper reserve');
 startAutonomousWork(s,only,PROJECTS,spare);
 assert.equal(queued.length,1,'only one spare-time job at a time');
 s.operations=s.operations.filter(o=>o.id>=0);s.wood=batch*SPARE_BATCHES;
 startAutonomousWork(s,only,PROJECTS,spare);
 assert.equal(queued.length,1,'the deeper reserve has a limit too');
 s.wood=batch*WORKING_BATCHES;
 assert.equal(workNeed(s,PROCESSES.repair_bucket,PROCESSES,PROJECTS,materialCount),null,'sound tools are left alone');
 foodChange(s,'bucket',1);foodChange(s,'repair_supplies',1);foodChange(s,'carpentry-tools',1);equipmentState(s).wear.bucket=EQUIPMENT_LIFE;
 assert.equal(residentWorkPlan(s,shop).recipe,'repair_bucket','worn tools are repaired first');
 assert.equal(workNeed(s,PROCESSES.corn_feed,PROCESSES,PROJECTS,materialCount),null,'no animals, no fodder work');
 assert.equal(autonomousWorkPlan(s,{key:key('wild-tree'),work:1e9,id:-9},PROCESSES,PROJECTS,api).recipe,undefined,'standing trees are never felled unprompted');
 assert.equal(workNeed(s,PROCESSES.solar_upgrade,PROCESSES,PROJECTS,materialCount),null,'installations stay player decisions');
}
{
 const {s,sites:[pit]}=village('supply-2');
 const full={...api,stored:()=>storageCapacity(s)};
 assert.match(autonomousWorkPlan(s,pit,PROCESSES,PROJECTS,full).reason,/storage room/,'shared storage keeps room for food');
 assert.match(autonomousWorkPlan(s,pit,PROCESSES,PROJECTS,{...api,walk:()=>MAX_WALK+1}).reason,/Too far/,'distant sites wait for an order');
 assert.match(autonomousWorkPlan(s,pit,PROCESSES,PROJECTS,{...api,walk:()=>Infinity}).reason,/Too far/,'unreachable sites are never queued');
 assert.equal(autonomousWorkPlan(s,pit,PROCESSES,PROJECTS,{...api,walk:()=>MAX_WALK}).recipe,'earth');
 s.infrastructure.nodes[pit.id].enabled=false;
 assert.match(residentWorkPlan(s,pit).reason,/Switched off/);
 const sandbox=village('supply-2');sandbox.s.mode='sandbox';
 assert.equal(residentWorkPlan(sandbox.s,sandbox.sites[0]).recipe,undefined);
}
{
 // One-second steps: residents sharing a waypoint must still arrive.
 const {s}=village();const spot={x:s.stock.x+6,z:s.stock.z+6};
 for(const r of s.people){r.x=spot.x-3+s.people.indexOf(r)*.05;r.z=spot.z;r.walk=[{...spot}];r.target={...spot};r.energy=100;for(const k of Object.keys(r.needs||{}))r.needs[k]=100;}
 const walkers=s.people.slice(0,2);
 advance(s,{seconds:20,dt:1});
 assert(walkers.every(r=>!r.walk.some(w=>w.x===spot.x&&w.z===spot.z)),'crowded residents reach a shared waypoint in fast steps');
}
console.log('PASS residents start building work, cook, repair and reach shared waypoints unprompted');
