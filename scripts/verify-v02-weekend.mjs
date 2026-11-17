import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,plan,placementError,tick,finished,canFinish,endWeekend,supplyRun,save,restore,PROJECTS,MATERIALS,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {ensureInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {transportCost} from '../web/v02/weekend/physical-trade.js';
import {ROAD_SHIFT,PARK_Z,accessRoadAt} from '../web/v02/weekend/road-layout.js';
import {arrivalPose,vehiclePose} from '../web/v02/weekend/arrival.js';
function fresh(camp){const s=createWeekend(42);enableFastNavigation(s);ensureInfrastructure(s).grid.enabled=false;assert(chooseCamp(s,camp));return s;}
function runUntil(s,seconds,done){for(let i=0;i<seconds*10&&!done();i++)tick(s,.1);assert(done(),'resident actions must finish within the scenario budget');}
function place(s,key){
 for(let radius=3;radius<20;radius++)for(let z=s.stock.z-radius;z<=s.stock.z+radius;z++)for(let x=s.stock.x-radius;x<=s.stock.x+radius;x++){
  if(Math.max(Math.abs(x-s.stock.x),Math.abs(z-s.stock.z))!==radius||placementError(s,key,x,z))continue;
  assert.equal(plan(s,key,x,z),'');return s.projects.at(-1);
 }
 assert.fail(`No legal ${key} site near ${s.camp}`);
}
// Current opening rules, at each actual campsite rather than the old tiny-map
// coordinates. Detailed work, collision, needs, removal and recipe behavior is
// covered in the dedicated construction, navigation and production regressions.
for(const camp of ['shade','entrance','clearing']){
 const s=fresh(camp);assert.equal(s.money,2000);
 for(const key of ['gathering','shelter','tarp-stores'])place(s,key);
 assert(!canFinish(s));runUntil(s,6400,()=>canFinish(s));
 for(const key of ['gathering','shelter','tarp-stores'])assert(finished(s,key),`${camp}: ${key}`);
 assert(s.people.every(r=>Number.isFinite(r.x)&&Number.isFinite(r.z)&&r.energy>=0&&r.energy<=100));
 assert(s.people.some(r=>r.work>0),'residents actually supply and construct the camp');
 assert(Math.abs(s.money-(s.finances.opening+s.finances.income-s.finances.expenses))<.011);
 assert(restore(save(s)),`${camp}: completed opening restores`);
 assert(endWeekend(s));runUntil(s,600,()=>s.people.every(r=>r.action==='meal'));
 assert(restore(save(s)),`${camp}: evening restores`);
 console.log(`PASS ${camp}: paid opening, resident labor, needs bounds, ledger, evening and save restoration`);
}
// Purchased goods settle once, including an in-flight save/reload.
const trip=fresh('entrance');trip.emergencyFood=false;
const money=trip.money,wood=trip.wood,cost=MATERIALS.wood.price+transportCost(trip);
assert(supplyRun(trip,'wood'));assert.equal(trip.money,money-cost);assert.equal(trip.wood,wood);
for(let i=0;i<200;i++)tick(trip,.1);
const loaded=restore(save(trip));assert(loaded);enableFastNavigation(loaded);
runUntil(loaded,900,()=>!loaded.trip);assert.equal(loaded.wood,wood+MATERIALS.wood.quantity);
for(let i=0;i<600;i++)tick(loaded,.1);
assert.equal(loaded.wood,wood+MATERIALS.wood.quantity,'no duplicate delivery after reload');
const bad=JSON.parse(save(loaded));bad.materials.tank=-1;assert.equal(restore(JSON.stringify(bad)),null);assert.equal(restore('{broken'),null);
console.log('PASS paid supply trip, in-flight restoration, exactly-once receipt and malformed-save rejection');

const intro=createWeekend();assert.equal(intro.arrivalElapsed,17);
for(let i=0;i<40;i++)tick(intro,.1);assert.equal(intro.time,0,'camp choice does not consume the day');
const introSaved=restore(save(intro));assert(introSaved);assert(chooseCamp(introSaved,'shade'));
const oldArrival=createWeekend();oldArrival.arrivalElapsed=3;assert.equal(restore(save(oldArrival)).arrivalElapsed,17);
for(let i=0;i<5;i++){
 assert(!arrivalPose(5,i).visible);const pose=arrivalPose(17,i);assert(pose.visible&&!pose.walking);
 assert(Math.abs(pose.x-(intro.people[i].x-32)*2)<1e-8);assert.equal(pose.z,(intro.people[i].z-32)*2);
}
assert(Math.abs(arrivalPose(6,0).car.x+1)<1e-8);assert.equal(arrivalPose(6,0).car.z,PARK_Z);
for(let t=0;t<=17;t+=.1){const a=vehiclePose(t,0),b=vehiclePose(t,1);assert(Math.hypot(a.x-b.x,a.z-b.z)>2.2);}
assert.equal(arrivalPose(8,3).visible,false);assert.equal(arrivalPose(9,3).visible,true);
for(let t=0;t<=17;t+=.25)for(const index of [0,1]){const pose=vehiclePose(t,index);for(const dx of [-1.1,1.1])assert(accessRoadAt((pose.x+dx)/2+32,pose.z/2+32));}
const entrance=fresh('clearing');assert.match(plan(entrance,'water',32,22-ROAD_SHIFT/2),/access road/);
assert(accessRoadAt((1.1-7)/2+32,-32));
console.log('PASS immediate setup, arrival migration, parked residents, two-vehicle clearance and protected access road');
