import assert from 'node:assert/strict';
import {tick,save,restore} from '../web/v02/weekend/simulation.js';
import {NEED_KEYS,mealTime} from '../web/v02/weekend/resident-needs.js';
import {village} from './fixtures.mjs';
const at=hour=>(hour-9)*60/.45;
function fresh(hour) {
 const {s}=village({seed:0,camp:'clearing',fast:false,time:at(hour)});
 s.people.forEach((r,i)=>{r.needs=Object.fromEntries(NEED_KEYS.map(k=>[k,100]));r.energy=90;r.x=30+i;r.z=-10;});
 return s;
}
function run(s,seconds,done){for(let i=0;i<seconds*10;i++){tick(s,.1);if(done())return true;}return false;}
for(const hour of [12,18,31]) {
 const s=fresh(hour),r=s.people[0];r.needs.hunger=65;
 assert(run(s,180,()=>r.needHistory?.hunger),`Actual meal at ${hour%24}:00`);
 assert.equal(r.needHistory.hunger,1);assert(Number.isFinite(r.lastMealAt));
 const loaded=restore(save(s));assert(loaded,'Meal save reloads');
 assert.equal(loaded.people[0].lastMealAt,r.lastMealAt);
 assert(!mealTime(loaded,loaded.people[0]),'A completed meal prevents a second meal in the same window');
}
for(const hour of [10,15,20]) {
 const s=fresh(hour),r=s.people[0];r.needs.hunger=65;
 run(s,30,()=>false);assert.notEqual(r.needTask?.kind,'hunger');assert(!r.needHistory?.hunger);
 r.needs.hunger=10;
 assert(run(s,180,()=>r.needHistory?.hunger),'Urgent hunger allows a meal outside normal hours');
}
{
 const s=fresh(22.6),r=s.people[0];r.energy=100;
 assert(run(s,120,()=>r.tentPhase==='inside'),'Resident goes to bed at night');
 const wake=r.sleepUntil;assert(wake);
 assert((wake-at(22.6))*.45/60>=7.5,'Even a rested resident gets at least 7.5 hours');
 assert((wake-at(22.6))*.45/60<=9.1,'Night sleep stays bounded');
 // Exercise the real interruption/resumption path near morning, when energy is full.
 s.time=wake-120;r.energy=100;r.needs.bladder=5;
 assert(run(s,90,()=>r.resumeSleepUntil==null&&r.sleepUntil===wake),'Bathroom break resumes the night even at full energy');
 const loaded=restore(save(s));assert(loaded);assert.equal(loaded.people[0].sleepUntil,wake);
}
{
 const s=fresh(12),r=s.people[0];r.lastMealAt=s.time+100;
 assert.equal(restore(save(s)),null,'Future meal timestamps are rejected');
 delete r.lastMealAt;assert(restore(save(s)),'Older saves without a meal timestamp still load');
}
console.log('PASS: breakfast/lunch/dinner, urgent snacks, no duplicate meals, overnight sleep, resumed sleep and save compatibility');
