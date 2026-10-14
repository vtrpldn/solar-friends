import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {placementReason,movePlacementReason,milestones} from '../web/polish.js';
import {sourceKinds} from '../web/resource-sites.js';
import {goalRoute} from '../web/quests.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const snap=g=>JSON.parse(g.snapshot());
function until(g,test,label,limit=6000){for(let i=0;i<limit;i++){const s=snap(g);if(test(s))return s;g.tick(.25);}throw Error(`Timed out: ${label}`);}
function checkpoint(g){const saved=g.snapshot();assert(g.restore(saved));assert.equal(g.snapshot(),saved);}
const paid=new Game();assert.equal(paid.place('garden',6,6),'ok');until(paid,s=>s.village.buildings[0].progress===100,'resident-built garden');
const earned=paid.snapshot(),quote=JSON.parse(paid.building_work_quote(0));assert.equal(quote.salvage[0],2);assert.equal(quote.salvage[2],2);
let timings=[];
for(const action of ['demolish','salvage']){
 const g=new Game();assert(g.restore(earned));const initial=snap(g),wood=initial.village.wood,earth=initial.village.economy.stock[2];
 assert.equal(g.queue_building_work(0,action,0,0),'ok');assert.equal(snap(g).village.wood,wood);assert.equal(snap(g).village.buildings.length,1);checkpoint(g);
 let ticks=0,visited=false,working=false,lastWork=0;
 until(g,s=>{
   const job=s.village.building_jobs[0];
   if(job?.work>lastWork){working=true;const minute=s.village.minutes%1440;assert(minute>=540&&minute<720||minute>=900&&minute<960,'Only community work hours advance crew progress');}if(job)lastWork=job.work;
   if(s.residents.some(r=>r.task==='building_work'&&r.activity_building===0&&Math.hypot(r.x-r.target_x,r.y-r.target_y)<=.08))visited=true;
   ticks++;if(ticks%50===0)checkpoint(g);
   return !s.village.buildings.length;
 },action);
 assert(working&&visited,'Real residents must reach the worksite');
 const done=snap(g);assert.equal(done.village.wood,wood+(action==='salvage'?2:0));assert.equal(done.village.economy.stock[2],earth+(action==='salvage'?2:0));assert.equal(done.village.building_jobs.length,0);
 assert(!done.residents.some(r=>r.activity_building===0||r.visit_building===0));checkpoint(g);
 assert.equal(milestones(initial.village,done.village).filter(e=>e.kind==='building').length,0);
 timings.push(ticks);g.free();
}
assert(timings[0]<timings[1],'Demolition must finish sooner than salvage from the same earned village');
// The player may cancel before packing ends, without a refund or teleport.
const g=new Game();g.start_mode('sandbox');assert.equal(g.place_with_recipe('home',5,5,'adobe'),'ok');
assert.equal(g.queue_building_work(0,'move',18,18),'ok');assert.equal(g.cancel_building_work(0),'ok');assert.equal(snap(g).village.buildings[0].x,5);checkpoint(g);
const before=snap(g);assert.equal(g.queue_building_work(0,'move',18,18),'ok');checkpoint(g);
assert.deepEqual(goalRoute(snap(g),{build:'home',recipe:'adobe',target:1}),{type:'visit',id:0},'A moved prerequisite should route to crew review instead of an unnecessary replacement');
assert.notEqual(g.place('home',18,18),'ok');assert.notEqual(g.toggle_road(18,18),'ok');assert.notEqual(g.place_source(0,18,18),'ok');
assert(placementReason(snap(g).village,'home',18,18));assert(placementReason(snap(g).village,'road',18,18));assert(placementReason(snap(g).village,sourceKinds[0],18,18));
until(g,s=>s.village.building_jobs[0]?.stage==='rebuild','packing');
let packing=snap(g);assert.equal(packing.village.buildings[0].x,18);assert.equal(packing.village.buildings[0].progress,0);assert.equal(packing.village.economy.projects[0].appearance,4);assert.notEqual(g.cancel_building_work(0),'ok');checkpoint(g);
until(g,s=>s.village.building_jobs.length===0,'resident rebuilding');
let moved=snap(g);assert.equal(moved.village.buildings[0].id,0);assert.equal(moved.village.buildings[0].progress,100);assert.equal(moved.village.economy.projects[0].recipe,'adobe');assert.equal(moved.village.economy.projects[0].appearance,4);assert.equal(moved.village.economy.next_building,1);assert.equal(moved.village.wood,before.village.wood);checkpoint(g);
assert.equal(g.place('garden',5,5),'ok','Old plot becomes reusable after packing');
// Native placement and every preview must respect both the old site and the reserved site.
const h=new Game();h.start_mode('sandbox');h.place('home',5,5);h.queue_building_work(0,'move',16,18);const reserved=h.snapshot(),v=JSON.parse(reserved).village;
let comparisons=0;
for(const kind of [...snap(h).environment.economy.recipes.map(r=>r.kind),'road',...sourceKinds])for(let x=1;x<=26;x++)for(let y=1;y<=26;y++){
 assert(h.restore(reserved));const allowed=!placementReason(v,kind,x,y);
 const result=kind==='road'?h.toggle_road(x,y):kind.startsWith('source_')?h.place_source(sourceKinds.indexOf(kind),x,y):h.place(kind,x,y);
 assert.equal(result==='ok',allowed,`${kind} ${x},${y}: reserved plot preview/native mismatch`);comparisons++;
}
assert(h.restore(reserved));h.cancel_building_work(0);const movable=h.snapshot(),mv=JSON.parse(movable).village;
for(let x=1;x<=26;x++)for(let y=1;y<=26;y++){
 assert(h.restore(movable));assert.equal(h.queue_building_work(0,'move',x,y)==='ok',!movePlacementReason(mv,0,x,y),`Move ${x},${y}`);comparisons++;
}
// No progress occurs simply because time advances after community work ends.
assert(h.restore(movable));h.queue_building_work(0,'move',18,18);const evening=snap(h);evening.village.minutes=1200;assert(h.restore(JSON.stringify(evening)));
for(let i=0;i<40;i++)h.tick(.25);assert.equal(snap(h).village.building_jobs[0].work,0);assert.equal(snap(h).village.buildings[0].x,5);checkpoint(h);
await mkdir('artifacts/building-work',{recursive:true});await writeFile('artifacts/building-work/earned-garden.json',earned);
g.free();h.free();paid.free();console.log(`PASS: real demolition/salvage work and conservation, slower salvage (${timings[1]} versus ${timings[0]} ticks), two-site relocation, preserved adobe identity, cancellation, exact saves, no evening labour and ${comparisons} placement comparisons.`);
