import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,save,restore,PROJECTS,requiredLoads,enableFastNavigation,prioritize} from '../web/v02/weekend/simulation.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {chooseNeed,advanceNeed,cancelNeed,inviteConversation} from '../web/v02/weekend/resident-needs.js';
import {PROFILES} from '../web/v02/weekend/resident-personality.js';
import {wantsConversation,conversationFor,finishPersonalTime,workPreference,noticeAspiration,aspirationStatus} from '../web/v02/weekend/resident-mind.js';

function fresh() {
  const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);
  s.rainSeen=s.rainResolved=true;syncInfrastructure(s,PROJECTS);
  s.people.forEach((r,i)=>{r.needs={hunger:90,bladder:90,bowels:90,hygiene:90,social:90,fun:90};r.energy=90;r.x=30+i;r.z=25;});
  return s;
}
const api={camp:()=>({x:30,z:25}),groundSpot:r=>({x:r.x,z:r.z}),route:()=>true,go:()=>true,serviceSpot:()=>null};
const run=(s,seconds,done=()=>false)=>{for(let i=0;i<seconds*10;i++){tick(s,.1);if(done())return true;}return done();};

// Identity is complete and all live aspirations refer to buildable catalog items.
for(const profile of Object.values(PROFILES)){
  for(const field of ['backstory','desire','motivation','fear','flaw','boundary','growth'])assert(profile[field]?.length>20,field);
  assert(PROJECTS[profile.aspiration.key]);
}
{
 const s=fresh(),[iara,bento,luz]=s.people;iara.needs.social=10;
 for(const state of [{sleepUntil:100},{tentPhase:'inside'},{action:'rest'},{action:'town'},{cargo:true},{energy:20},{mind:{memories:[],quietUntil:100}},{needTask:{kind:'fun'}}]){
  const candidate={...bento,...state};assert(!wantsConversation(s,candidate,iara),JSON.stringify(state));
 }
 for(const field of ['hunger','bladder','bowels','hygiene'])assert(!wantsConversation(s,{...bento,needs:{...bento.needs,[field]:5}},iara));
 assert(!wantsConversation(s,{...bento,job:1},iara),'do not drag a content worker away');
 assert(wantsConversation(s,{...bento,job:1,needs:{...bento.needs,social:20}},iara),'two lonely workers can agree to a break');
 iara.needs.social=45;
 assert(!wantsConversation(s,bento,iara),'reserved resident declines when content');
 assert(wantsConversation(s,luz,iara),'sociable resident welcomes the same invitation');
 assert.equal(bento.friendships,undefined,'declining does not punish friendship');
}
{
 const s=fresh(),[iara,bento]=s.people;
 s.people.slice(2).forEach(r=>r.sleepUntil=1000);iara.needs.social=5;bento.needs.social=20;
 chooseNeed(s,iara,0,api);assert.equal(iara.needTask.partner,bento.id);
 // Being assigned a conversation does not grant remote friendship or memories.
 assert(!iara.friendships && !bento.mind);
 bento.x=60;advanceNeed(s,iara,30,api);assert.equal(iara.needTask.elapsed,0);assert(!iara.friendships);
 bento.x=31;advanceNeed(s,iara,18,api);
 assert.equal(iara.friendships.bento,8);assert.equal(bento.friendships.iara,4,'listening and being heard have different effects');
 assert.equal(iara.needHistory.social,1);assert.equal(bento.needHistory.social,1);
 assert(!iara.needTask && !bento.needTask);assert(iara.mind.memories[0].text.includes('listen'));
 assert(!wantsConversation(s,bento,iara),'quiet interval after company');
 const loaded=restore(save(s));assert(loaded);assert.deepEqual(loaded.people[0].mind,iara.mind);
 const before=structuredClone(iara.mind);advanceNeed(s,iara,30,api);assert.deepEqual(iara.mind,before,'completion recorded once');
}
{
 const s=fresh(),[iara,bento]=s.people;iara.needs.social=5;bento.needs.social=20;s.people.slice(2).forEach(r=>r.sleepUntil=1000);
 chooseNeed(s,iara,0,api);cancelNeed(s,iara);
 assert(!iara.needTask && !bento.needTask);assert(!iara.friendships && !bento.mind,'cancelled conversations earn nothing');
 chooseNeed(s,iara,0,api);iara.needs.bladder=1;chooseNeed(s,iara,0,api);
 assert.equal(iara.needTask.kind,'bladder');assert(!bento.needTask,'urgent need releases the other participant');
}
{
 const s=fresh(),[iara,bento,luz,caua]=s.people;
 iara.needs.social=45;luz.needs.social=55;
 chooseNeed(s,iara,0,{...api,groundSpot:()=>null});assert(!iara.needTask,'no reachable meeting place, no forced conversation');
 assert.equal(conversationFor(s,bento,caua).topic,'making and repairing things');
 assert(workPreference(iara,'orchard')>workPreference(bento,'orchard'));
 assert(workPreference(bento,'house')>workPreference(luz,'house'));
 bento.needs.fun=44;luz.needs.fun=44;
 chooseNeed(s,bento,1,api);assert(!bento.needTask,'Bento is comfortable working longer');
 chooseNeed(s,luz,2,api);assert.equal(luz.needTask.kind,'fun','Luz wants a break sooner');
 advanceNeed(s,luz,22,api);assert.equal(luz.mind.memories[0].kind,'personal');
 const p={id:s.nextId++,key:'orchard',x:40,z:40,work:0,delivered:0};s.projects.push(p);
 noticeAspiration(s,iara,PROJECTS);assert(!iara.mind,'blueprint is not a fulfilled hope');
 p.work=PROJECTS.orchard.work;p.delivered=requiredLoads('orchard');noticeAspiration(s,iara,PROJECTS);
 assert(aspirationStatus(s,iara,PROJECTS).complete);noticeAspiration(s,iara,PROJECTS);assert.equal(iara.mind.memories.length,1);
 for(let i=0;i<20;i++){s.time++;finishPersonalTime(s,iara,'Enjoying the garden');}
 assert.equal(iara.mind.memories.length,6,'bounded memory across long games');
 assert(restore(save(s)));
 for(const mutate of [r=>r.mind=null,r=>r.mind.quietUntil=Infinity,r=>r.mind.quietUntil=s.time+101,r=>r.mind.memories[0].time=s.time+1,r=>r.mind.memories[0].other='stranger',r=>r.mind.memories[0].text='x'.repeat(301),r=>r.mind.memories=Array(7).fill(r.mind.memories[0])]){
  const bad=JSON.parse(save(s));mutate(bad.people[0]);assert.equal(restore(JSON.stringify(bad)),null);
 }
 const legacy=JSON.parse(save(s));legacy.people.forEach(r=>delete r.mind);assert(restore(JSON.stringify(legacy)),'old saves remain supported');
}
// Actual scheduler chooses personal goals without replacing a committed project.
for(const [id,key] of [['iara','orchard'],['luz','kitchen'],['bento','house']]){
 const s=fresh(),r=s.people.find(p=>p.id===id);
 s.economyPolicies={sales:{},work:{food:0,maintenance:0,production:0,construction:3,essentialWorkers:0,productionWorkers:0}};
 s.people.filter(p=>p!==r).forEach(p=>p.sleepUntil=1000);
 for(const [i,k] of ['kitchen','orchard','house'].entries())s.projects.push({id:s.nextId++,key:k,x:40+i*6,z:40,work:0,delivered:requiredLoads(k)});
 tick(s,.1);
 assert.equal(s.projects.find(p=>p.id===r.job)?.key,key,`${id} chooses work aligned with their hope`);
 const assigned=r.job;tick(s,.1);assert.equal(r.job,assigned,'stay with a commitment between decisions');
 const other=s.projects.find(p=>p.work===0 && p.id!==assigned);prioritize(s,other.id);tick(s,.1);
 assert.equal(r.job,other.id,'explicit player priority wins over personal hopes');
 const loaded=restore(save(s));assert(loaded);assert.equal(loaded.projects.find(p=>p.id===other.id).prioritized,true);
 const bad=JSON.parse(save(s));bad.projects[0].prioritized='yes';assert.equal(restore(JSON.stringify(bad)),null);
}
// Exercise actual scheduling, navigation, completion, and continuation after load.
{
 const s=fresh();s.people[0].needs.social=5;s.people[1].needs.social=20;
 assert(run(s,300,()=>s.people.some(r=>r.mind?.memories.some(m=>m.kind==='conversation'))),'conversation through real tick and paths');
 const loaded=restore(save(s));assert(loaded);enableFastNavigation(loaded);
 loaded.people.forEach(r=>{r.needs.fun=5;});
 assert(run(loaded,500,()=>loaded.people.every(r=>r.needHistory?.fun)),'all personalities complete personal time after reload');
 assert(restore(save(loaded)));
}
console.log('PASS resident agency: boundaries, mutual invitations, arrival, interruption, personal rhythms, shared interests, asymmetric memories, aspirations, bounded saves and real simulation continuation');

// An outside shift cannot be hijacked by a village conversation or leisure visit.
for(const phase of ['outbound','away','inbound']){
 const s=fresh(),[a,b]=s.people;a.needs.social=5;b.needs.social=5;
 b.outsideWork={phase};
 assert.equal(wantsConversation(s,b,a),false);
 assert.equal(inviteConversation(s,b,1,api),false);
 b.needs.fun=5;chooseNeed(s,b,1,api);assert.equal(b.needTask,undefined);
}
console.log('PASS outside workers keep their commute and shift commitments');
