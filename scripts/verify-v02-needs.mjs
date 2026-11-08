import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,requiredLoads,tick,save,restore,plan,supplyRun} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {NEED_KEYS} from '../web/v02/weekend/resident-needs.js';
const run=(s,seconds,done=()=>false)=>{for(let i=0;i<seconds*10;i++){tick(s,.1);if(done())return true;}return done();};
function fresh(){const s=createWeekend();chooseCamp(s,'clearing');s.people.forEach((r,i)=>{r.needs=Object.fromEntries(NEED_KEYS.map(k=>[k,100]));r.x=30+i;r.z=-10;r.energy=90;});return s;}
function built(s,key,x=40,z=39){const p={id:s.nextId++,key,x,z,work:PROJECTS[key].work,delivered:requiredLoads(key)};s.projects.push(p);syncInfrastructure(s,PROJECTS);return p;}
{
 const s=fresh(),r=s.people[0];r.needs.hunger=10;
 const meals=s.materials.meals;
 assert(run(s,200,()=>r.needTask?.elapsed>2),'resident reaches food');
 assert.equal(s.materials.meals,meals,'walking and beginning a meal do not consume it twice');
 const loaded=restore(save(s));assert(loaded);assert.deepEqual(loaded.people[0].needs,r.needs);
 assert(run(loaded,200,()=>loaded.people[0].needHistory?.hunger),'saved meal resumes safely');
 assert.equal(loaded.materials.meals,meals-1);assert(loaded.people[0].needs.hunger>80);
 console.log('PASS: physical eating, individual food consumption and interruption-safe saves');
}
for(const kind of ['bladder','bowels']) {
 const s=fresh(),p=built(s,'eco_toilet'),r=s.people[0];r.needs[kind]=5;
 let inside=false;
 assert(run(s,300,()=>{inside ||= r.needTask?.site===p.id && r.needTask.elapsed>0;return r.needHistory?.[kind];}),kind);
 assert(inside,'resident actually visits the toilet');assert(r.needs[kind]>90);
 assert(s.infrastructure.nodes[p.id].water[3]>0,'toilet produces sewage');
}
{
 const s=fresh(),r=s.people[0];r.needs.bowels=5;
 assert(run(s,300,()=>r.needHistory?.bowels),'no-toilet fallback completes');assert(s.latrineWaste>0);
}
for(const where of ['home','river']) {
 const s=fresh(),r=s.people[0];r.needs.hygiene=5;
 const sys=syncInfrastructure(s,PROJECTS);Object.values(sys.nodes).forEach(n=>n.water.fill(0));
 let home;if(where==='home'){home=built(s,'house');sys.nodes[home.id].water[0]=5;}
 let visited=false;
 assert(run(s,400,()=>{visited ||= where==='home' ? r.needTask?.site===home.id && r.needTask.elapsed>0 : r.needTask?.river && r.needTask.elapsed>0;return r.needHistory?.hygiene;}),`wash ${where}`);
 assert(visited);assert(r.needs.hygiene>70);
 if(home)assert(sys.nodes[home.id].water[2]>0,'home washing creates greywater');
}
console.log('PASS: separate pee/bowel needs, toilet waste, camp fallback, home and river washing');
{
 const s=fresh(),r=s.people[0];r.needs.social=5;
 let paired=false;
 assert(run(s,300,()=>{paired ||= s.people.filter(p=>p.needTask?.kind==='social').length===2;return r.needs.social>90;}),'conversation finishes');assert(paired);
 assert(s.people.every(p=>p.needTask?.kind!=='social'),'both partners released');
}
{
 const s=fresh(),r=s.people[0];r.needs.fun=5;built(s,'reading-room');
 let reading=false;
 assert(run(s,300,()=>{reading ||=r.needTask?.animation==='read';return r.needHistory?.fun;}));assert(reading);
}
{
 const s=fresh(),r=s.people[0];r.needs.hunger=5;s.materials.meals=0;s.materials.food=0;
 run(s,20);assert(!r.needTask,'no phantom meal when food is unavailable');assert.equal(s.materials.meals,0);
 r.cargo=true;r.needs.bladder=5;tick(s,.1);assert(!r.needTask,'never abandon carried supplies for a break');
}
{
 const s=fresh(),r=s.people[0];r.energy=10;
 let inside=false;assert(run(s,300,()=>{inside ||=r.tentPhase==='inside';return inside&&!r.tentPhase&&r.energy>=60;}),'low-energy resident sleeps and wakes');
}
{
 const s=fresh(),r=s.people[0];r.needs.hunger=5;assert.equal(plan(s,'gathering',29,35),'');
 assert(run(s,1500,()=>s.projects[0].work===PROJECTS.gathering.work),'construction resumes around personal breaks');
 assert(r.needHistory?.hunger);assert(restore(save(s)));
 const bad=JSON.parse(save(s));bad.people[0].needs.hunger=101;assert.equal(restore(JSON.stringify(bad)),null);
 const old=JSON.parse(save(s));old.people.forEach(p=>delete p.needs);assert(restore(JSON.stringify(old)),'older saves initialize needs');
}
console.log('PASS: paired conversation, recreation, unavailable supplies, cargo safety, energy recovery, work resumption and save validation');

{
 const s=fresh();s.materials.food=0;s.materials.meals=0;s.people.forEach(r=>r.needs.hunger=5);
 assert(supplyRun(s,"food"),"hungry residents can fetch food rather than deadlock");
 assert(run(s,400,()=>!s.trip),"food trip returns");assert(s.materials.food>0);
}
console.log("PASS: hungry residents can collect town food");

{
 const s=fresh();assert.equal(plan(s,'shelter',34,39),'');
 s.people.forEach(r=>r.needs.social=5);
 assert(run(s,180,()=>s.people.filter(r=>r.needs.social>80).length>=2),
   'lonely residents can socialize together while a large project is active');
 assert(s.projects[0].work<PROJECTS.shelter.work,'conversation happens before the project ends');
}
console.log('PASS: mutually lonely residents take social breaks during active projects');
