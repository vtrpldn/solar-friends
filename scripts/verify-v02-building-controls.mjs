import assert from 'node:assert/strict';
import {createWeekend,PROJECTS,requiredLoads} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure,hasPowerService,canSwitchBuilding,switchBuilding} from '../web/v02/weekend/infrastructure.js';
const s=createWeekend();
for(const [key,def] of Object.entries(PROJECTS))s.projects.push({id:s.nextId++,key,x:40,z:40,work:def.work,delivered:requiredLoads(key)});
const sys=syncInfrastructure(s,PROJECTS);
const node=key=>sys.nodes[s.projects.find(p=>p.key===key).id];
for(const key of ['road','bridge','garden','orchard','goat_pasture','supply-1','supply-3','picnic-table','canvas-tent-teal','banana_treatment','biodigester']) {
 const n=node(key);
 assert(!hasPowerService(sys,n),`${key}: no electrical service`);
 assert(!canSwitchBuilding(sys,n),`${key}: no switch`);
 assert.equal(switchBuilding(sys,n.id),false);
 assert.equal(n.enabled,true);
 n.enabled=false;
 syncInfrastructure(s,PROJECTS);
 assert.equal(n.enabled,true,`${key}: old disabled save recovers`);
}
for(const key of ['streetlight','solar_farm','hydro','house','workshop','well','supply-6']) {
 const n=node(key);
 n.demand=0;n.generation=0;n.power=0;
 assert(hasPowerService(sys,n),`${key}: capability survives zero demand`);
 assert(switchBuilding(sys,n.id));assert.equal(n.enabled,false);
 syncInfrastructure(s,PROJECTS);assert.equal(n.enabled,false,'intentional power switch persists');
 assert(switchBuilding(sys,n.id));assert.equal(n.enabled,true);
}
const barrel=node('rain-barrel');
assert(!canSwitchBuilding(sys,barrel));
sys.links.push({from:barrel.id,to:node('garden').id,kind:'irrigation',enabled:false,work:1,required:1});
assert(hasPowerService(sys,barrel),'connected pump needs electricity even when idle');
assert(canSwitchBuilding(sys,barrel));
assert(switchBuilding(sys,barrel.id));
assert(!canSwitchBuilding(sys,sys.nodes[0]),'camp has a separate grid control');
assert(!canSwitchBuilding(sys,undefined));
assert.equal(switchBuilding(sys,99999),false);
console.log(`PASS: passive structures have no power/switch, legacy disabled states recover, active controls persist, and pump capability is stable; ${s.projects.length} catalog nodes initialized.`);
