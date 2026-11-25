import assert from 'node:assert/strict';
import {PROJECTS,createSandbox,plan,tick,save,restore,enableFastNavigation,requiredLoads} from '../web/v02/weekend/simulation.js';
import {ensureCommunity,planEvent,planError,cancelEvent,eventSites,eventDays,communityVisitors,communityStep,clock as calendar,bookFavour,favourError,maxHelpers,maxGuests,validCommunity,COURSE_FEE,COURSE_FEE_NO_LUNCH,HELPER_PACE} from '../web/v02/weekend/village-life.js';
import {DAY,HOUR} from '../web/v02/weekend/weather.js';

// A sandbox village with a fire circle, a classroom and a house still to build.
let s=createSandbox(42);enableFastNavigation(s);
const place=(key)=>{let error='none';for(let z=30;z<60&&error;z++)for(let x=36;x<70&&error;x++)error=plan(s,key,x,z);assert.equal(error,'',key);return s.projects.at(-1);};
const fire=place('fire-circle'),classroom=place('outdoor-classroom');
s.instantBuild=false;const house=place('house');house.delivered=requiredLoads(house);
assert(fire.work>=PROJECTS['fire-circle'].work&&house.work<PROJECTS.house.work);
const c=ensureCommunity(s);assert.equal(c.goodwill,40);assert.equal(maxHelpers(s),5);assert.equal(maxGuests(s),8);
const until=(day,hour)=>{while(calendar(s.time).absoluteDay<day||calendar(s.time).hour<hour)tick(s,1);};
const reload=()=>{assert(validCommunity(s,PROJECTS));const next=restore(save(s));assert(next,'village with community events saves and loads');s=next;enableFastNavigation(s);return s;};
const history=()=>s.community.history[0];

// Planning rules.
assert.deepEqual(eventDays(s,'mutirao',2),[5,6]);assert.equal(eventDays(s,'festa',1)[0],0,'a festa can still be called for this evening');
assert.deepEqual(eventSites(s,'mutirao',PROJECTS).map(p=>p.id),[house.id]);
assert.match(planError(s,'mutirao',{site:fire.id,day:5,guests:3},PROJECTS),/still being built/);
assert.match(planError(s,'mutirao',{site:house.id,day:3,guests:3},PROJECTS),/Saturday or Sunday/);
assert.match(planError(s,'mutirao',{site:house.id,day:5,guests:9},PROJECTS),/between 2 and 5/);
assert.match(planError(s,'course',{site:fire.id,day:5,teacher:'nina'},PROJECTS),/classroom or community hall/);
assert.match(planError(s,'course',{site:classroom.id,day:5},PROJECTS),/who teaches/);
assert.match(planError(s,'festa',{site:classroom.id,day:2,guests:2},PROJECTS),/gathering place/);
assert.equal(planEvent(s,'festa',{site:fire.id,day:2,guests:4},PROJECTS),'');
assert.match(planError(s,'festa',{site:fire.id,day:2,guests:0},PROJECTS),/already planned/);
assert(cancelEvent(s,s.community.events[0].id,()=>{}));assert.equal(s.community.goodwill,40,'calling off ahead of time costs nothing');

// Mutirão on Saturday: neighbours add work, stop short of finishing, and the village owes a day.
assert.equal(planEvent(s,'mutirao',{site:house.id,day:5,guests:4},PROJECTS),'');
until(5,7.9);const before=s.projects.find(p=>p.id===house.id).work;assert.equal(communityVisitors(s).length,0);
until(5,10);reload();
assert.equal(communityVisitors(s).length,4);assert(communityVisitors(s).every(v=>Number.isFinite(v.x)&&Number.isFinite(v.z)&&v.pose));
until(5,16.2);
const built=s.projects.find(p=>p.id===house.id);assert(built.work-before>=Math.min(PROJECTS.house.work*.97-before,6*HOUR*4*HELPER_PACE)-1,'neighbours added their hours');
assert.equal(s.community.owed,1);assert.match(history().text,/Mutirão over: 4 neighbours/);assert.equal(communityVisitors(s).length,0);
assert(s.people.every(r=>r.mind?.memories.some(m=>/mutirão/.test(m.text))),'everyone remembers the mutirão');

// A friend returns the day: away for a working day, unpaid, and the debt is cleared.
const helper=s.people[1];assert.equal(favourError(s,helper),'');assert(bookFavour(s,helper));
assert.match(favourError(s,s.people[2]),/already going/);
let left=false,away=0;for(let i=0;i<2*DAY&&s.community.owed;i++){tick(s,1);const gone=s.people[1].outsideWork?.favour===true;left||=gone;away+=gone?1:0;if(away===1500)reload();}
assert(away>8*HOUR,'a full working day away');
assert(left,'the friend left for the neighbour’s land');assert.equal(s.community.owed,0);assert.equal(s.community.goodwill,43);
assert.match(favourError(s,s.people[1]),/owe the neighbours no work/);

// Sunday roda: the friends sit together and what they say is kept.
until(7,1);assert(s.community.history.some(h=>h.kind==='roda'),'a roda was held on Sunday');
assert(s.community.minutes&&s.community.minutes.day===6);

// Festa on a weekday evening: friends and neighbours gather, and goodwill grows.
assert.equal(planEvent(s,'festa',{site:fire.id,day:9,guests:6},PROJECTS),'');
until(9,19);assert.equal(communityVisitors(s).length,6);
const festa=s.community.events.find(e=>e.kind==='festa');assert(Object.keys(festa.present||{}).length>=3,'most friends came to the festa');
let gathered=false;for(let i=0;i<60&&!gathered;i++){tick(s,1);gathered=s.people.some(r=>r.needTask?.kind==='gather');}assert(gathered,'friends keep returning to the festa between breaks');reload();
until(9,21.2);assert.match(history().text,/festa is over: 6 neighbours came/);assert(s.community.goodwill>44&&s.community.goodwill<50,'a festa adds a few points after a week of fading');
const afterFesta=s.community.goodwill;

// Weekend course: the teacher stays with the class and the fees reach savings.
assert.equal(planEvent(s,'course',{site:classroom.id,day:12,teacher:'nina'},PROJECTS),'');
assert.match(planError(s,'course',{site:classroom.id,day:13,teacher:'luz'},PROJECTS),/within a fortnight/);
until(12,11);const course=s.community.events.find(e=>e.kind==='course');assert(course.here>=2&&course.here<=12);assert.equal(communityVisitors(s).length,course.here);
until(12,15.2);assert.match(history().text,/Course finished: \d+ participants/);assert(Math.abs(s.community.goodwill-(afterFesta+1))<.01);
assert.match(planError(s,'course',{site:classroom.id,day:19,teacher:'luz'},PROJECTS),/one course a fortnight/);
console.log('PASS planning rules, mutirão work and debt, returned favour, weekly roda, festa and a taught course in a living village');

// Money and food are settled exactly, in a story village.
{const story={time:3*HOUR,stage:'playing',mode:'story',money:100,landSeed:7,materials:{meals:5},wood:5,people:[{id:'nina',name:'Nina',needs:{}}],projects:[{id:1,key:'outdoor-classroom',x:40,z:40,work:PROJECTS['outdoor-classroom'].work}],operations:[],log:[]};
 const lines=[],api={say:(_,t)=>lines.push(t),ready:()=>true};
 ensureCommunity(story).events.push({id:1,kind:'course',site:1,day:0,guests:0,teacher:'nina',phase:'planned'});story.community.nextId=2;story.community.goodwill=100;
 story.foodStorage={version:1,lots:{meals:[{n:5,expires:1e9}]},spoiled:{}};
 communityStep(story,1,PROJECTS,api);const e=story.community.events[0];assert.equal(e.phase,'running');assert(e.here>5);const here=e.here;
 e.taught=6*HOUR;story.time=e.until;communityStep(story,1,PROJECTS,api);
 assert.equal(story.materials.meals,0,'participants ate what there was');assert.equal(story.money,100+here*COURSE_FEE_NO_LUNCH,'no full lunch, lower fee');
 assert.equal(story.finances.categories.courses,here*COURSE_FEE_NO_LUNCH);assert(COURSE_FEE>COURSE_FEE_NO_LUNCH);
 // A teacher who is not there loses the course and some goodwill.
 story.community.events.push({id:2,kind:'course',site:1,day:0,guests:0,teacher:'nina',phase:'running',until:story.time,centre:{x:40,z:40,radius:2},here:6,taught:HOUR});story.community.nextId=3;
 const money=story.money;communityStep(story,1,PROJECTS,api);assert.equal(story.money,money);assert.equal(story.community.goodwill,95);assert.match(lines.at(-1),/fell apart/);
 // A mutirão with lunch for only some: the rest go home, and it is remembered.
 story.projects.push({id:2,key:'house',x:50,z:50,work:0});story.materials.meals=2;story.foodStorage.lots.meals=[{n:2,expires:1e9}];
 story.community.events.push({id:3,kind:'mutirao',site:2,day:0,guests:5,phase:'running',until:story.time+HOUR,centre:{x:50,z:50,radius:2},here:5,worked:0});story.community.nextId=4;
 communityStep(story,1,PROJECTS,api);const m=story.community.events.find(e=>e.id===3);assert.equal(m.here,2);assert.equal(m.unfed,3);assert.equal(story.materials.meals,0);
 story.time=m.until;communityStep(story,1,PROJECTS,api);assert.equal(story.community.owed,1);assert.equal(story.community.goodwill,89);
 assert(validCommunity(story,PROJECTS));story.community.goodwill=120;assert(!validCommunity(story,PROJECTS));}
// Goodwill fades by the week toward plain acquaintance, and recovers slowly from a grudge.
{const quiet={time:0,stage:'playing',mode:'story',people:[],projects:[],materials:{},log:[]},api={say(){},ready:()=>true};
 ensureCommunity(quiet).goodwill=100;quiet.community.roda=false;communityStep(quiet,1,PROJECTS,api);
 for(let w=1;w<=52;w++){quiet.time=w*7*DAY;communityStep(quiet,1,PROJECTS,api);if(w===1)assert(Math.abs(quiet.community.goodwill-94.4)<1e-9);}
 assert(quiet.community.goodwill>30&&quiet.community.goodwill<32,'a year of neglect leaves acquaintance');
 quiet.community.goodwill=10;quiet.time+=7*DAY;communityStep(quiet,1,PROJECTS,api);assert.equal(quiet.community.goodwill,11);assert(validCommunity(quiet,PROJECTS));}
console.log('PASS course fees with and without lunch, an absent teacher, neighbours sent home hungry, and goodwill fading');
