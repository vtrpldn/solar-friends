import assert from 'node:assert/strict';
import {createSandbox,PROJECTS,requiredLoads,plan,restore,save,tick} from '../web/v02/weekend/simulation.js';
import {autoConnectUtilities} from '../web/v02/weekend/auto-utilities.js';
import {infrastructureStep,hasPowerService,syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
const s=createSandbox();s.people=[];s.rain=true;
for(const [i,key] of ['water','well'].entries())s.projects.push({id:i+1,key,x:40+i*4,z:40,work:PROJECTS[key].work,delivered:requiredLoads(key)});
const sys=autoConnectUtilities(s,PROJECTS),tank=sys.nodes[1],cistern=sys.nodes[2];
assert.equal(tank.kind,'water-storage');assert.deepEqual(tank.capacity,[500,0,0,0]);assert(!hasPowerService(sys,tank));assert(!sys.links.some(l=>l.kind==='power'&&(l.from===1||l.to===1)));
sys.grid.enabled=false;
for(let i=0;i<100;i++)infrastructureStep(s,PROJECTS,.1);
assert(cistern.water[0]+tank.water[0]>0,'an unpowered cistern collects rain and shares it');assert.equal(cistern.water[1],0);assert.equal(tank.water[1],0);assert(!hasPowerService(sys,cistern),'a cistern is plain storage');
sys.links=sys.links.filter(l=>l.from!==2);cistern.water[0]=0;tank.water[0]=10;sys.nodes[0].water[0]=0;
for(let i=0;i<100;i++)infrastructureStep(s,PROJECTS,.1);
assert(sys.nodes[0].water[0]>0,'passive tank delivers without grid power');assert(tank.water[0]<10);
tank.kind='well';tank.water=[50,0,0,0];tank.capacity=[75,0,0,0];
syncInfrastructure(s,PROJECTS);
assert.equal(tank.kind,'water-storage');assert.deepEqual(tank.water,[50,0,0,0]);assert.deepEqual(tank.capacity,[500,0,0,0]);
console.log('PASS distinct storage capacity, no tank power service, passive delivery and rain collection');
assert.equal(sys.nodes[0].maintainFresh,true);assert.equal(tank.maintainFresh,true);assert.equal(sys.nodes[0].maintainSanitation,true);
tank.maintainFresh=false;sys.nodes[0].maintainSanitation=false;syncInfrastructure(s,PROJECTS);
assert.equal(tank.maintainFresh,false);assert.equal(sys.nodes[0].maintainSanitation,false);
console.log('PASS autonomous essential water defaults preserve explicit opt-outs');

const village = createSandbox(42);
assert.equal(plan(village, 'house', 50, 50), '');
const homeId = village.projects.at(-1).id;
const home = syncInfrastructure(village, PROJECTS).nodes[homeId];
home.capacity = [8, 0, 24, 0];
home.water[2] = 21;
delete home.maintainSanitation;
for (const preference of [undefined, false]) {
  if (preference !== undefined) home.maintainSanitation = preference;
  const loaded = restore(save(village));
  assert(loaded);
  tick(loaded, .1);
  const migrated = loaded.infrastructure.nodes[homeId];
  assert.equal(migrated.capacity[3], 16);
  assert.equal(migrated.maintainSanitation, preference ?? true);
  assert.equal((loaded.operations ?? []).some(op => op.site === homeId && op.water?.service), preference ?? true);
}
console.log('PASS legacy homes migrate sanitation and honor the saved preference on the first tick');
{
 // Sites that only make greywater need emptying too, or a full tank stops
 // their work for good. A wetland treats its own and is left alone.
 const {createWeekend:fresh,chooseCamp:camp,PROJECTS:defs}=await import('../web/v02/weekend/simulation.js');
 const {syncInfrastructure:sync,ensureInfrastructure:infra}=await import('../web/v02/weekend/infrastructure.js');
 const v=fresh();v.arrivalElapsed=17;camp(v,'clearing');
 for(const [key,x] of [['kitchen',10],['wash-station',20],['wetland',26],['garden',40]])v.projects.push({id:v.nextId++,key,x,z:40,rotation:0,work:defs[key].work,delivered:0});
 sync(v,defs);
 const upkeep=Object.fromEntries(Object.values(infra(v).nodes).map(n=>[n.kind,n.maintainSanitation]));
 assert.equal(upkeep.kitchen,true);assert.equal(upkeep['wash-station'],true);
 assert.equal(upkeep.wetland,undefined);assert.equal(upkeep.garden,undefined);
 console.log('PASS greywater-only sites default to waste upkeep; treatment wetlands do not');
}
{
 // A village saved while untreated water was its own class keeps every litre as clean water.
 const {readFileSync}=await import('node:fs');
 const text=readFileSync(new URL('../docs/balance/evidence/2026-11-17-integrated-day-100-save.json',import.meta.url),'utf8');
 const before=JSON.parse(text),total=nodes=>Object.values(nodes).reduce((n,a)=>n+a.water[0]+a.water[1],0);
 assert(Object.values(before.infrastructure.nodes).some(n=>n.capacity[1]>0),'the saved village predates the change');
 const old=restore(text);
 assert(old,'an older village still loads');
 const nodes=Object.values(old.infrastructure.nodes);
 assert(nodes.every(n=>n.capacity[1]===0&&n.water[1]===0),'no untreated compartment remains');
 assert(Math.abs(total(old.infrastructure.nodes)-total(before.infrastructure.nodes))<1e-6,'stored water is kept');
 assert(old.infrastructure.links.every(l=>l.kind!=='irrigation'),'irrigation pipes become ordinary pipes');
 assert(!old.operations.some(o=>!o.done&&o.water?.purify),'purification jobs are dropped');
 assert(!old.people.some(r=>r.operation!=null&&!old.operations.some(o=>o.id===r.operation)),'nobody is left holding a dropped job');
 assert.deepEqual(JSON.parse(save(restore(save(old)))),JSON.parse(save(old)),'the migration runs once');
 console.log('PASS villages saved with untreated water migrate to clean water without losing any');
}
