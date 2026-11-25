import assert from 'node:assert/strict';
import {createSandbox,PROJECTS,requiredLoads,plan,restore,save,tick} from '../web/v02/weekend/simulation.js';
import {autoConnectUtilities} from '../web/v02/weekend/auto-utilities.js';
import {infrastructureStep,hasPowerService,syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
const s=createSandbox();s.people=[];s.rain=true;
for(const [i,key] of ['water','well'].entries())s.projects.push({id:i+1,key,x:40+i*4,z:40,work:PROJECTS[key].work,delivered:requiredLoads(key)});
const sys=autoConnectUtilities(s,PROJECTS),tank=sys.nodes[1],cistern=sys.nodes[2];
assert.equal(tank.kind,'water-storage');assert.deepEqual(tank.capacity,[250,250,0,0]);assert(!hasPowerService(sys,tank));assert(!sys.links.some(l=>l.kind==='power'&&(l.from===1||l.to===1)));
sys.grid.enabled=false;
for(let i=0;i<100;i++)infrastructureStep(s,PROJECTS,.1);
assert(cistern.water[1]>0);assert.equal(tank.water[1],0);assert.equal(tank.water[0],0);
tank.water[0]=10;sys.nodes[0].water[0]=0;
for(let i=0;i<100;i++)infrastructureStep(s,PROJECTS,.1);
assert(sys.nodes[0].water[0]>0,'passive tank delivers without grid power');assert(tank.water[0]<10);
assert.equal(cistern.water[0],0,'unpowered cistern cannot treat rainwater');
tank.kind='well';tank.water=[50,12,0,0];tank.capacity=[75,60,0,0];
syncInfrastructure(s,PROJECTS);
assert.equal(tank.kind,'water-storage');assert.deepEqual(tank.water,[50,12,0,0]);assert.deepEqual(tank.capacity,[250,250,0,0]);
console.log('PASS distinct storage capacity, no tank power service, passive delivery, rain collection and powered treatment gating');
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
