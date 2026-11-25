import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,PROCESSES,queueSanitation,plan,tick,enableFastNavigation,materialCount} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';

// An idle resident sent to service the waste tanks must keep walking while a building
// site is also waiting for workers. The leisure interruption used to clear the
// route every tick, freezing the resident in place with the job reserved.
const s=createWeekend(42);chooseCamp(s,'shade');enableFastNavigation(s);s.rainSeen=true;s.rainResolved=true;
const tank=syncInfrastructure(s,PROJECTS).nodes[0];
tank.water=[40,0,60,0];tank.maintainFresh=false;tank.maintainSanitation=false;
assert.equal(plan(s,'gathering',s.stock.x-14,s.stock.z),'','a construction site is pending');
s.people.forEach(r=>{r.energy=90;for(const k in r.needs)r.needs[k]=95;});
const r=s.people[0];
Object.assign(r,{x:s.stock.x-8,z:s.stock.z+6,action:'idle',walk:[],target:null,job:null});
assert.equal(queueSanitation(s,0)||'','');
const op=s.operations.at(-1);r.operation=op.id;
s.people.slice(1).forEach(o=>{o.sleepUntil=s.time+5000;o.action='rest';});
const start={x:r.x,z:r.z};
for(let i=0;i<3000&&!op.done;i++)tick(s,.1);
assert(Math.hypot(r.x-start.x,r.z-start.z)>1,`resident walked to the tank (${r.action})`);
assert(op.done,'tank service finished');
assert.equal(tank.water[2],0,'the greywater was taken away');
console.log('PASS tank service walk survives pending construction');

// A building planned over a felled tree must not strand the cut logs or the
// resident sent back for the next load.
const f=createWeekend(42);chooseCamp(f,'shade');enableFastNavigation(f);f.rainSeen=true;f.rainResolved=true;
const key=Object.keys(PROJECTS).find(k=>k.startsWith('wild-')&&PROJECTS[k].kind==='wild-tree');
const tree={id:f.nextId++,key,x:f.stock.x-14,z:f.stock.z,work:1,delivered:0,natural:true,felled:true};
f.projects.push(tree);syncInfrastructure(f,PROJECTS);
assert.equal(plan(f,'workshop',tree.x,tree.z),'','workshop can cover a felled tree');
f.projects.at(-1).pendingMaterials={};
const haul={id:1,site:tree.id,recipe:'fell_tree',phase:'return',work:PROCESSES.fell_tree.work,haulRemaining:{logs:7},returningToSite:true};
f.operations=[haul];f.nextOperation=2;
f.people.forEach(r=>{r.energy=90;for(const k in r.needs)r.needs[k]=95;});
const before=materialCount(f,'logs');
for(let i=0;i<20000&&!haul.done;i++)tick(f,.1);
assert(haul.done,`remaining logs were hauled (${haul.status})`);
assert.equal(materialCount(f,'logs'),before+7);
console.log('PASS logs under a new building site are still collected');
