import assert from 'node:assert/strict';
import {PROJECTS,PROCESSES,queueProduction,queueWater,maintainWater,queueSanitation,tick,save,restore} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure,infrastructureStep} from '../web/v02/weekend/infrastructure.js';
import {autoConnectUtilities} from '../web/v02/weekend/auto-utilities.js';
import {resourceSnapshot} from '../web/v02/weekend/resource-trends.js';
import {village,addSite} from './fixtures.mjs';
const fresh=()=>{const {s}=village({camp:'shade'});s.rainSeen=true;s.rainResolved=true;return s;};
const built=(s,key,x,z)=>{const p=addSite(s,key,{x,z});syncInfrastructure(s,PROJECTS);return p;};
const advance=(s,predicate)=>{for(let i=0;i<30000&&!predicate();i++)tick(s,.1);assert(predicate(),JSON.stringify(s.operations));};
const s=fresh(),k=built(s,'kitchen',40,40),g=built(s,'garden',48,40);
s.materials.food=20;s.materials.seedlings=20;autoConnectUtilities(s,PROJECTS);
assert.equal(queueProduction(s,k.id,'meals'),'');
const kitchen=s.infrastructure.nodes[k.id];kitchen.water[0]=0;
s.people.forEach(r=>r.sleepUntil=1000);infrastructureStep(s,PROJECTS,1);
assert.equal(kitchen.demand,0,'blocked daytime kitchen has no load');
const night=structuredClone(s);night.time=1600;infrastructureStep(night,PROJECTS,1);assert.equal(night.infrastructure.nodes[k.id].demand,.025,'night light only, not cooking load');
s.time=0;s.people.forEach(r=>{r.sleepUntil=0;r.energy=90;});
const op=s.operations[0];op.phase='process';op.status='Working';s.people[0].operation=op.id;s.people[0].action='produce';infrastructureStep(s,PROJECTS,1);assert.equal(kitchen.demand,.45,'active equipment has cooking load');
assert.equal(queueProduction(s,g.id,'vegetables'),'');
assert.equal(queueWater(s,-1,g.id),'','water delivery can unblock queued crop');
assert(restore(save(s)),'concurrent operations restore');
const water=fresh();const construction=built(water,'house',45,45);construction.work=0;delete water.infrastructure.nodes[construction.id];const tank=syncInfrastructure(water,PROJECTS).nodes[0];tank.water=[0,0,0,0];water.infrastructure.grid.enabled=false;tank.maintainFresh=true;
advance(water,()=>tank.water[0]>=12);
assert(water.operations.some(o=>o.water?.from===-1&&o.done),'maintenance includes physical river haul while construction is pending');
assert(restore(save(water)),'maintenance preferences and jobs restore');
const toilet=built(water,'eco_toilet',39,39),waste=water.infrastructure.nodes[toilet.id];waste.water[3]=waste.capacity[3];waste.maintainSanitation=true;maintainWater(water);
assert(water.operations.some(o=>o.site===toilet.id&&o.water?.service));
advance(water,()=>waste.water[3]===0);assert(water.infrastructure.account.wasteRemoved>0);
assert.equal(queueSanitation(water,toilet.id),'No waste to service.');
const homeKey=Object.keys(PROJECTS).find(key=>PROJECTS[key].kind==='home');
assert(!PROJECTS[homeKey].materials.panels&&!PROJECTS[homeKey].materials.batteries);
const house=built(water,homeKey,55,48);assert.equal(water.infrastructure.nodes[house.id].battery,0);
for(const [id,n] of Object.entries(PROCESSES.solar_upgrade.input))water.materials[id]=n;
assert.equal(queueProduction(water,house.id,'solar_upgrade'),'');advance(water,()=>house.solarUpgrade);
syncInfrastructure(water,PROJECTS);assert.equal(water.infrastructure.nodes[house.id].battery,4);
assert(restore(save(water)),'upgraded house restores');
const legacy=JSON.parse(save(water));delete legacy.homeEnergyVersion;legacy.projects.find(p=>p.id===house.id).delivered+=3;
assert(restore(JSON.stringify(legacy)),'legacy home with original equipment load restores');
const totals=resourceSnapshot({money:1,wood:2,materials:{meals:3,food:4},infrastructure:{nodes:{a:{water:[8],charge:2},b:{water:[9],charge:3}}}});
assert.equal(totals.meals,7);assert.equal(totals.water,17);assert.equal(totals.power,5);
console.log('PASS blocked/active machinery, night lights, concurrent watering, automatic hauling, sanitation, optional solar, old/new saves, whole-village HUD');

const endurance=fresh();
for(let i=0;i<6*3200;i++)tick(endurance,1);
const restored=restore(save(endurance));
assert(restored,'six days of resident activity restore');
assert.equal(restored.time,endurance.time);assert.deepEqual(restored.materials,endurance.materials);
console.log('PASS Day 7 save round trip retains time and materials');
{
 // Organic residues once filled the stores and froze the village: carriers
 // stood holding loads they could not put down, with every need at zero.
 const sim=await import('../web/v02/weekend/simulation.js');
 const {createWeekend:fresh,chooseCamp:camp,tick:step,storedMaterials:stored,storageCapacity:capacity,queueProduction:queue,enableFastNavigation:fast}=sim;
 const v=fresh(42);camp(v,'entrance');fast(v);for(let i=0;i<20;i++)step(v,.1);
 const base=stored(v);v.materials.scraps=(v.materials.scraps||0)+5000;
 assert.equal(stored(v),base,'residues take no room in the stores');
 // Stores that really are full: the load is set down and the carrier is released.
 const site=v.projects.find(p=>p.natural&&!queue(v,p.id,'earth'))||v.projects.find(p=>v.operations?.some(o=>o.site===p.id&&o.recipe==='earth'));
 assert(site,'an earth deposit accepts a job');
 const op=v.operations.find(o=>o.site===site.id&&!o.done&&!o.water);
 let returning=false;
 for(let i=0;i<60000&&!returning;i++){step(v,.1);returning=op.phase==='return';}
 assert(returning,'the job reaches its carry-home phase');
 v.materials.stone=capacity(v);
 let setDown=false;
 for(let i=0;i<6000&&!setDown;i++){step(v,.1);setDown=/load waits beside the stores/.test(op.status||'');}
 assert(setDown,'a full store makes the carrier set the load down');
 assert(v.people.every(r=>r.operation!==op.id),'nobody is left holding the load');
 assert(sim.restore(sim.save(v)),'the waiting load survives a save');
 v.materials.stone=0;
 for(let i=0;i<120000&&!op.done;i++)step(v,.1);
 assert(op.done,'the load is stored once there is room');
 console.log('PASS residues take no storage room; a full store releases its carriers and the load is stored later');
}
