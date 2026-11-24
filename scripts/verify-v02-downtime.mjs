import {FUNCTIONAL_PROGRAM} from '../web/v02/library/functional-program.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createResident,poseResident,animateResident} from '../web/v02/residents/rig.js';
import {idleActivity,downtimeMotion,downtimeLabel,downtimeInvalid} from '../web/v02/weekend/resident-downtime.js';
import {createWeekend,chooseCamp,tick,save,restore,PROJECTS,requiredLoads,enableFastNavigation,plan,footprint} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {chooseNeed,inviteConversation} from '../web/v02/weekend/resident-needs.js';

const fresh=()=>{
 const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);s.rainSeen=s.rainResolved=true;s.time=1300;
 s.people.forEach((r,i)=>{r.x=30+i;r.z=25;r.energy=95;r.needs={hunger:95,bladder:95,bowels:95,hygiene:95,social:95,fun:90};});
 // A stocked village leaves no self-started work, so residents are free for leisure.
 for(const id of ['earth','stone','logs','bamboo'])s.materials[id]=99;
 syncInfrastructure(s,PROJECTS);return s;
};
const fire=s=>{const p={id:s.nextId++,key:'fire-circle',x:34,z:25,work:PROJECTS['fire-circle'].work,delivered:requiredLoads('fire-circle')};s.projects.push(p);syncInfrastructure(s,PROJECTS);return p;};
const api={catalog:PROJECTS,center:p=>({x:p.x,z:p.z}),sheltered:()=>false,projectSpot:p=>({x:p.x-1,z:p.z}),camp:()=>({x:30,z:25}),groundSpot:(r,c)=>({x:c.x+2,z:c.z+2}),route:()=>[],go:()=>false};
{
 const s=fresh(),r=s.people[1];fire(s);
 idleActivity(s,r,1,.1,api);assert.equal(r.downtime.kind,'fire');assert.equal(downtimeMotion(r),null,'do not sit while en route');
 const initial=r.needs.fun;
 for(let i=0;i<50;i++){s.time++;idleActivity(s,r,1,1,api);}
 assert.equal(r.downtime.elapsed,0,'travel must not consume the visit');assert.equal(r.needs.fun,initial,'walking must not award stationary recovery');
 Object.assign(r,r.downtime.target);const arrived={...api,go:()=>true};idleActivity(s,r,1,1,arrived);
 assert.equal(downtimeMotion(r),'fire-sit');assert.equal(downtimeLabel(r),'Sitting by the fire');
 assert.deepEqual(r.downtime.facing,{x:34,z:25});assert(r.needs.fun>initial);
 for(let i=0;i<32;i++){s.time++;idleActivity(s,r,1,1,arrived);}
 assert.notEqual(r.downtime?.kind,'fire','leave after a bounded visit and vary activity');
}
{
 const s=fresh(),r=s.people[1];fire(s);s.rain=true;
 idleActivity(s,r,1,1,api);assert.notEqual(r.downtime.kind,'fire','no visit to an exposed fire in rain');
}
{
 const s=fresh(),r=s.people[1];fire(s);idleActivity(s,r,1,1,api);
 const removed=s.projects.find(p=>p.key==='fire-circle').id;delete s.infrastructure.nodes[removed];
 s.projects=s.projects.filter(p=>p.key!=='fire-circle');idleActivity(s,r,1,1,api);
 assert.notEqual(r.downtime.site,removed,'removed destination is abandoned');
 syncInfrastructure(s,PROJECTS);
 const loaded=restore(save(s));assert(loaded);assert.equal(loaded.people[1].downtime,null,'transient paths are replanned after load');
}
{
 const s=fresh(),r=s.people[0];fire(s);r.needs.fun=1;
 chooseNeed(s,r,0,{...api,serviceSpot:n=>({x:n.x-1,z:n.z})});
 assert.equal(r.needTask.animation,'fire-sit','a needed recreation visit also uses the fire pose');
 assert(r.needTask.facing);
}
// The actual scheduler and pathfinder reach the fire, sit, leave, and react to work.
{
 const s=fresh(),r=s.people[1];fire(s);s.people.filter(p=>p!==r).forEach(p=>p.sleepUntil=10000);
 const seen=new Set();let seated=false,travel=false;
 for(let i=0;i<1500;i++){
  tick(s,.1);
  if(r.downtime){seen.add(r.downtime.kind);if(r.walk.length){travel=true;assert.equal(downtimeMotion(r),null);}}
  if(downtimeMotion(r)==='fire-sit'){seated=true;assert(Math.hypot(r.x-34,r.z-25)>=1,'never sit in the flames');}
 }
 assert(travel && seated,'walk to the fire then sit in the running simulation');assert(seen.size>=2,'do something else after visiting');
 assert.equal(plan(s,'gathering',40,40),'');
 for(let i=0;i<50 && !r.job;i++)tick(s,.1);
 assert(r.job,'available work interrupts casual leisure');assert.equal(r.downtime,null);
 assert(restore(save(s)));
}
// Free residents can start a real fireside conversation before becoming lonely.
{
 const s=fresh();fire(s);s.people[0].needs.social=70;s.people[2].needs.social=75;
 let conversation=false;
 for(let i=0;i<1000;i++){
  tick(s,.1);
  conversation ||= s.people.some(r=>r.needTask?.kind==='social');
 }
 assert(conversation,'mutual fireside invitation runs through the actual scheduler');
 assert(s.people.some(r=>r.mind?.memories.some(m=>m.kind==='conversation')),'the conversation finishes');
 assert(restore(save(s)));
}
{
 const s=fresh(),r=s.people[1],p=fire(s);idleActivity(s,r,1,1,api);
 p.x+=3;assert(downtimeInvalid(s,r,PROJECTS),'moving a destination invalidates the old visit');
}
{
 const s=fresh(),r=s.people[1];s.rain=true;s.rainAt=s.time;
 s.people.filter(p=>p!==r).forEach(p=>p.sleepUntil=10000);
 const p={id:s.nextId++,key:'reading-room',x:34,z:25,work:PROJECTS['reading-room'].work,delivered:requiredLoads('reading-room')};
 s.projects.push(p);syncInfrastructure(s,PROJECTS);
 let indoors=false;
 for(let i=0;i<300;i++){
  tick(s,.1);
  if(r.downtime?.arrived && r.downtime.site===p.id){
   indoors=true;const [w,d]=footprint(p),[roofW,roofD]=FUNCTIONAL_PROGRAM[p.key].shell;
   const localX=(r.x-p.x-(w-1)/2)*2,localZ=(r.z-p.z-(d-1)/2)*2;
   assert(Math.abs(localX)<=roofW/2 && Math.abs(localZ)<=roofD/2,'rain break lies within the modeled roof');
  }
 }
 assert(indoors,'resident reaches shelter in actual rain');
}
{
 const s=fresh(),r=s.people[0];r.needs.social=20;r.mind={memories:[],quietUntil:s.time+20};
 assert.equal(inviteConversation(s,r,0,api),false,'spontaneous invitations also respect the initiator’s quiet time');
}
// New seated poses retain contact with the ground and animate hands/head.
for(const id of ['iara','bento','luz','caua','nina']){
 const {rig}=createResident(id);
 for(const action of ['fire-sit','ground-read']){
  for(const time of [0,2,4,8]){
   poseResident(rig,action,time);
   const legs=Math.min(...rig.legs.map(l=>new THREE.Box3().setFromObject(l.hip).min.y));
   assert(legs>=-.001,`${id} ${action}: legs penetrate ground`);
   assert(rig.hips.position.y<.3,'sit on the ground rather than hover at chair height');
   assert.equal(rig.book.visible,action==='ground-read');
  }
 }
 poseResident(rig,'fire-sit',0);const before=rig.arms[0].shoulder.rotation.x;
 poseResident(rig,'fire-sit',2);assert.notEqual(rig.arms[0].shoulder.rotation.x,before,'warming gesture changes over time');
 animateResident(rig,'fire-sit',0,.5);animateResident(rig,'walk',1,.5);
 assert.equal(rig.motion.action,'walk');assert(rig.hips.position.y>.85,'stand back up for walking');
}
console.log('PASS purposeful downtime: travel before activity, finite visits, variety, rain/removal, safe saves, work interruption, fire-facing ground poses, gestures and book visibility');
