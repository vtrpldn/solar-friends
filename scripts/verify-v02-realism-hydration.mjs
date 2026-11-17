import assert from 'node:assert/strict';
import {hydrationStep,hydrationDemand,drinkWater,packDrinkingWater,hydrationWorkFactor} from '../web/v02/weekend/hydration.js';
import {ensureNeeds,chooseNeed,advanceNeed} from '../web/v02/weekend/resident-needs.js';
const r={id:'iara',name:'Iara',energy:100,action:'idle',x:0,z:0,walk:[]};ensureNeeds(r);const n={id:0,kind:'camp',enabled:true,x:0,z:0,water:[10,0,0,100],capacity:[40,60,0,100]};const s={stage:'playing',time:0,stock:{x:0,z:0},people:[r],infrastructure:{nodes:{0:n},account:{waterUsed:0}},materials:{},weather:{temperatureC:25}};
assert.equal(hydrationDemand(s,r),2.5);hydrationStep(s,r,3200);assert.equal(r.needs.hydration,0);assert.equal(n.water[0],10);
const api={serviceSpot:()=>({x:0,z:0}),route:()=>[{}],go:()=>true,groundSpot:()=>({x:0,z:0})};chooseNeed(s,r,0,api);assert.equal(r.needTask.kind,'hydration');advanceNeed(s,r,2,api);assert.equal(r.needs.hydration,20);assert.equal(n.water[0],9.5);assert.equal(n.water[2],0);assert.equal(n.water[3],100);advanceNeed(s,r,2,api);assert.equal(n.water[0],9.5);
assert(packDrinkingWater(s,r,1));const before=n.water[0];r.needs.hydration=0;hydrationStep(s,r,0);assert.equal(r.needs.hydration,20);assert.equal(n.water[0],before);assert.equal(r.drinkingWater,.5);assert(hydrationWorkFactor(r)>0);
n.water[0]=0;assert(!drinkWater(s,0,.5));r.needRetryAt=0;r.needs.hydration=0;chooseNeed(s,r,0,{...api,route:()=>null});assert(r.needBlocked.includes('potable'));
r.action='build';s.weather.temperatureC=40;assert.equal(hydrationDemand(s,r),5);
console.log('PASS individual demand, actual drinking, full sewage independence, trip reserves, no duplicate consumption and unreachable-source warning');
{
 const {createWeekend,chooseCamp,tick,enableFastNavigation,save,restore,PROJECTS}=await import('../web/v02/weekend/simulation.js');
 const {syncInfrastructure}=await import('../web/v02/weekend/infrastructure.js');
 const village=createWeekend(42);chooseCamp(village,'entrance');enableFastNavigation(village);
 const camp=syncInfrastructure(village,PROJECTS).nodes[0];camp.water[0]=camp.water[1]=0;
 for(const person of village.people){ensureNeeds(person);person.needs.hydration=0;person.energy=0;}
 for(let i=0;i<64000;i++)tick(village,.1);
 assert(village.people.every(person=>person.needs.hydration>15&&person.energy>15),'exhausted dehydrated residents rest, fetch, filter, and drink without injected water');
 assert(restore(save(village)));console.log('PASS zero-energy, zero-hydration village recovers from empty tanks through ordinary care');
}
