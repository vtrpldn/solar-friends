import assert from 'node:assert/strict';
import {PROJECTS,plan,placementError,tick,queueProduction,save,restore} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure,connect,infrastructureStep} from '../web/v02/weekend/infrastructure.js';
import {village} from './fixtures.mjs';
function built(s,key){
 for(let radius=3;radius<=32;radius++)for(let z=s.stock.z-radius;z<=s.stock.z+radius;z++)for(let x=s.stock.x-radius;x<=s.stock.x+radius;x++){
  if(Math.max(Math.abs(x-s.stock.x),Math.abs(z-s.stock.z))!==radius||placementError(s,key,x,z))continue;
  assert.equal(plan(s,key,x,z),'');syncInfrastructure(s,PROJECTS);return s.projects.at(-1);
 }
 assert.fail(`No legal ${key} site`);
}
function until(s,seconds,done){for(let i=0;i<seconds*10&&!done();i++)tick(s,.1);assert(done());}
for(const [key,need,waste]of [['wash-station','hygiene',2],['eco_toilet','bowels',3]]){
 const s=village({sandbox:true}).s,p=built(s,key),node=s.infrastructure.nodes[p.id];node.water[0]=8;
 for(const other of Object.values(s.infrastructure.nodes))if(other.id!==p.id)other.enabled=false;
 const r=s.people[0];r.energy=100;for(const id in r.needs)r.needs[id]=90;r.needs[need]=0;
 until(s,600,()=>node.water[waste]>0);assert(r.needHistory[need]>0);assert(restore(save(s)));
}
console.log('PASS resident washing and toilet use consume water or create waste through physical visits');
{
 const s=village({sandbox:true}).s,battery=built(s,'supply-6'),lamp=built(s,'streetlight');
 assert.equal(connect(s,PROJECTS,'power',battery.id,lamp.id),'');s.infrastructure.links[0].work=s.infrastructure.links[0].required;
 const n=s.infrastructure.nodes[battery.id];s.infrastructure.grid.enabled=false;n.charge=n.battery;const charge=n.charge;n.enabled=false;s.time=1800;
 infrastructureStep(s,PROJECTS,1);assert.equal(s.infrastructure.nodes[lamp.id].power,0);assert.equal(n.charge,charge);
 n.enabled=true;infrastructureStep(s,PROJECTS,1);assert.equal(s.infrastructure.nodes[lamp.id].power,1);assert(n.charge<charge);
}
{
 const s=village({sandbox:true}).s,digester=built(s,'biodigester'),kitchen=built(s,'kitchen');
 s.infrastructure.grid.enabled=false;s.infrastructure.nodes[digester.id].water[3]=12;s.infrastructure.nodes[kitchen.id].water[0]=6;
 infrastructureStep(s,PROJECTS,60);assert(s.infrastructure.biogas>.2);assert.equal(queueProduction(s,kitchen.id,'meals'),'');
 until(s,1000,()=>s.operations[0].done);assert(s.operations[0].biogas,'the resident uses sewage-derived cooking fuel');assert(restore(save(s)));
}
{
 const s=village({sandbox:true}).s,hydro=built(s,'hydro'),barrel=built(s,'rain-barrel');s.time=1800;s.rain=true;
 infrastructureStep(s,PROJECTS,60);assert(s.infrastructure.nodes[hydro.id].generation>0);assert(s.infrastructure.nodes[barrel.id].water[0]>0);assert.equal(s.infrastructure.nodes[barrel.id].water[1],0);
}
console.log('PASS battery isolation, actual biogas cooking, nighttime hydro and rainwater collection');
