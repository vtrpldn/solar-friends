import {MATERIAL_KEYS} from '../web/materials.js';
import {MAP_SIZE,hydroCell} from '../web/terrain.js';
import {buyServiceParts} from './upkeep-playtest.mjs';
import {writeFileSync} from 'node:fs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import init,{Game} from '../web/pkg/solar_friends.js';
import {quests,questCompleted,storyBuildingKinds,goalRoute} from '../web/quests.js';
import {placementReason} from '../web/polish.js';
import {sourceKinds} from '../web/resource-sites.js';
await init({module_or_path:await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),snap=()=>JSON.parse(g.snapshot()),output=process.argv[2]||'artifacts/story-optional';
if(output)await fs.mkdir(output,{recursive:true});
await fs.mkdir('artifacts/logistics',{recursive:true});
g.set_outside_work(true);
assert.equal(g.set_work_preference(1,'materials',2),'ok');
const chapterResults=[];
let savedCareCheckIn=false,upkeepChecked=-Infinity,serviceOrders=0,serviceSpending=0;
function until(test,label,limit=24000){
 for(let i=0;i<limit;i++){
  // Keep every quarter-second simulation step. Poll the full UI snapshot every
  // three game minutes; chapter waits do not need a render snapshot each tick.
  if(i%4===0||i===limit-1){
   const current=snap(),care=current.village.situations.active;
   if(current.village.minutes-upkeepChecked>=1440){
    upkeepChecked=current.village.minutes;const order=buyServiceParts(g,current);
    if(order){serviceOrders++;serviceSpending+=order.paid;}
   }
   if(output&&!savedCareCheckIn&&care&&care.response==null&&care.resolved==null){writeFileSync(`${output}/care-check-in.json`,g.snapshot());savedCareCheckIn=true;}
   if(test(current))return;
  }
  g.tick(.25);
 }
 const s=snap(),chapter=s.village.progress.tracked;writeFileSync('artifacts/logistics/stalled-story.json',g.snapshot());
 throw new Error(`Timed out: ${label} on day ${1+Math.floor(s.village.minutes/1440)}. ${JSON.stringify({chapter,goals:quests[chapter].objectives(s.village).filter(o=>!o.done),stock:s.environment.economy.shortage,residents:s.residents.map(r=>[r.name,r.task,r.reason]),progress:s.village.progress})}`);
}
function location(kind){
 const v=snap().village;
 // Leave access corridors between plots; continuous first-fit rows create walls.
 if(kind!=='hydro')for(const y of [5,9,13,17,21,25])for(const x of [5,9,13,17,21])if(!placementReason(v,kind,x,y)&&(kind!=='apiary'||v.buildings.some(b=>['orchard','grove'].includes(b.kind)&&Math.max(Math.abs(b.x-x),Math.abs(b.y-y))<=6)))return [x,y];
 if(kind==='hydro')for(let y=5;y<=25;y++)for(const x of [hydroCell(y)])if(!placementReason(v,kind,x,y)&&(kind!=='apiary'||v.buildings.some(b=>['orchard','grove'].includes(b.kind)&&Math.max(Math.abs(b.x-x),Math.abs(b.y-y))<=6)))return [x,y];
 if(kind.startsWith('source_'))for(let y=2;y<MAP_SIZE-2;y++)for(let x=2;x<MAP_SIZE-2;x++)if(!placementReason(v,kind,x,y))return [x,y];
 throw Error(`No accessible planned plot for ${kind}`);
}
function localHousingPlot(){
 const v=snap().village,w=v.buildings.find(b=>b.kind==='workshop'),origins=[[10,13],[w.x+2,w.y]],plans=[];
 // Compare the real routed haul cost instead of adding housing to the far
 // end of the first-fit rows. This is a player layout choice, not free stock.
 for(let y=2;y<26;y++)for(let x=2;x<25;x++)if(!placementReason(v,'home',x,y))for(const point of [[x+2,y],[x-2,y],[x,y+2],[x,y-2]]){
  const routes=origins.map(from=>JSON.parse(g.route_quote(...from,...point)).route);
  if(routes.every(Boolean))plans.push({site:[x,y],point,origins,cost:routes[0].minutes*2+routes[1].minutes});
 }
 plans.sort((a,b)=>a.cost-b.cost);assert(plans.length,'Local housing needs reachable stores and a workshop');return plans[0];
}
function purchase(items){if(!items.some(Boolean))return;until(s=>s.environment.economy.money>=items.reduce((n,q,i)=>n+q*s.environment.economy.materials[i].price,6000),'purchase funds');assert.equal(g.order_supplies(JSON.stringify(items)),'ok');}
function build(kind,recipe='standard',local=false,site=null){
 const localPlan=local&&!site?localHousingPlot():null;
 const [x,y]=site||localPlan?.site||location(kind);assert.equal(g.place_with_recipe(kind,x,y,recipe),'ok',`${kind} placement`);
 const id=snap().village.buildings.at(-1).id;
 if(local){
  assert.equal(g.configure_project(id,3,false,recipe),'ok','Prioritise this locally supplied housing project');
  for(const origin of localPlan?.origins||[]){
   const route=JSON.parse(g.route_quote(...origin,...localPlan.point)).route;assert(route,'The placed home must retain its service approach');
   for(const [rx,ry] of route.points){const px=Math.round(rx),py=Math.round(ry),v=snap().village;if(!v.roads.some(p=>p[0]===px&&p[1]===py)&&!placementReason(v,'road',px,py))assert.equal(g.toggle_road(px,py),'ok');}
  }
  console.log(`Local housing plan: (${x}, ${y}) with native-routed supply roads and high project priority`);
 }
 const missing=snap().environment.economy.shortage;
 if(local){for(const i of [5,6,7,8])missing[i]=0;missing[0]+=12;missing[2]+=20;missing[4]+=6;}
 purchase(missing);
 const started=snap().village.minutes;
 // Local construction includes extraction, processing and resident work and recovery
 // cycles. Keep a finite twenty-four-day bound for a complete building.
 until(s=>s.village.buildings.find(b=>b.id===id).progress>=100,`build ${kind}`,24*1920);
 if(kind==='home'&&recipe==='adobe')console.log(`Local adobe home: ${((snap().village.minutes-started)/1440).toFixed(1)} game days from blueprint to completion`);
 return id;
}
function source(material){const [x,y]=location(sourceKinds[material]);assert.equal(g.place_source(material,x,y),'ok');return snap().village.economy.sources.length-1;}
function cable(fromBuilding,toBuilding){
 const ports=snap().village.power.network.nodes,port=id=>ports.find(n=>n.owner.kind==='building'&&n.owner.id===id).id;
 const from=port(fromBuilding),to=port(toBuilding),quote=JSON.parse(g.electrical_connection_quote(from,to));assert(quote.allowed,quote.reason);
 assert.equal(g.queue_electrical_connection(from,to),'ok');const id=snap().village.pipes.lines.at(-1).id;
 purchase(snap().environment.economy.shortage);
 until(s=>s.village.pipes.lines.find(p=>p.id===id).phase==='active','deliver and install the paid electrical cable',8*1920);
 const saved=g.snapshot();assert(g.restore(saved));assert.equal(g.snapshot(),saved);
 return id;
}
async function complete(chapter){
 until(s=>questCompleted(s.village,chapter),quests[chapter].title);
 // Earlier valid effort may finish two newly unlocked chapters in one tick.
 // Select the next journal page through its real command for reproducible UI checkpoints.
 assert(g.track_quest(Math.min(chapter+1,quests.length-1)));
 const saved=g.snapshot(),s=snap();assert(quests[chapter].objectives(s.village).every(o=>o.done),`Rust and UI agree: ${quests[chapter].title}`);
 if(!g.restore(saved)){writeFileSync(`${output}/invalid-chapter-${chapter+1}.json`,saved);assert.fail(`reload chapter ${chapter+1}`);}assert.equal(g.snapshot(),saved);
 assert.equal(s.village.progress.tracked,Math.min(chapter+1,quests.length-1));
 if(output)await fs.writeFile(`${output}/solar-${chapter===0?'intro':chapter===12?'complete':`chapter-${chapter+1}`}.json`,saved);
 const accounts=JSON.parse(g.simulation_report());assert(accounts.materials.every(m=>m.difference===0));
 for(let i=0;i<4;i++){const w=accounts.water;assert(Math.abs(w.opening[i]+w.received[i]-w.consumed[i]-w.present[i])<.001);}
 const energy=s.village.power.network,a=energy.account;assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-energy.nodes.reduce((n,p)=>n+p.charge,0))<.001);
 chapterResults.push({chapter:chapter+1,minutes:s.village.minutes,day:1+Math.floor(s.village.minutes/1440),money:s.village.economy.money});
 console.log(`Chapter ${chapter+1}/${quests.length}: ${quests[chapter].title} · day ${1+Math.floor(s.village.minutes/1440)}`);
 if(chapter<quests.length-2){
  const earned=quests.slice(0,chapter+2).every((_,i)=>questCompleted(s.village,i));
  assert.equal(g.track_quest(chapter+2),earned,'journal access follows completed prerequisites, including earlier valid effort');
  assert(g.track_quest(chapter+1));
 }
}
let timber,solar;
if(process.env.SOLAR_STORY_FROM){
 const raw=await fs.readFile(process.env.SOLAR_STORY_FROM,'utf8');assert(g.restore(raw));assert.equal(g.snapshot(),raw);
 const v=snap().village;assert(quests.slice(0,9).every((_,i)=>questCompleted(v,i)),'Resume only an earned first nine chapters');
 assert.equal(v.progress.tracked,9);timber=v.economy.sources.findIndex(s=>s.material===0);solar=v.buildings.find(b=>b.kind==='solar_farm').id;
 console.log('Resuming the earned chapter-nine checkpoint with an exact restore');
}else{
until(s=>s.village.arrived,'arrival');
// Keep daily food and shelter near the arrival store, then expand along corridors.
for(const [kind,x,y] of [['well',6,10],['home',8,8],['garden',13,10],['kitchen',10,10],['home',12,7]])build(kind,'standard',false,[x,y]);
await complete(0);
build('grove');timber=source(0);const bamboo=source(1);await complete(1);
build('square','standard',false,[8,16]);
// A shared table beside homes and the kitchen keeps actual guest and food trips short.
for(const [x,y] of [[10,7],[10,8],[11,8],[11,9],[11,10],[11,11],...[11,12,13,14,15,16,17,18].map(y=>[10,y])])assert.equal(g.toggle_road(x,y),'ok');
until(s=>s.village.progress.social_people.length===s.residents.length&&g.host_gathering()==='ok','welcome supper');
await complete(2);
build('warehouse');
// Expand a real street network as the village grows. Keep blueprints, stores,
// kitchens and later utility plots connected rather than relying on distant dirt walks.
const streets=[...Array.from({length:15},(_,i)=>i+11).flatMap(y=>[11,15,19].map(x=>[x,y])),...[11,15,19,23].flatMap(y=>Array.from({length:19},(_,i)=>[i+4,y]))];
for(const [x,y] of streets)if(!snap().village.roads.some(([a,b])=>a===x&&b===y)&&!placementReason(snap().village,'road',x,y))assert.equal(g.toggle_road(x,y),'ok');
const basket=Array(MATERIAL_KEYS.length).fill(0);basket[0]=1;
until(()=>g.order_supplies_pickup(JSON.stringify(basket),3)==='ok','resident pickup');
until(()=>g.contribute_tool_library()==='ok','tool library');await complete(3);
for(const k of ['workshop','compost','greenhouse'])build(k);
// Restore the actual garden through delivered compost and attended work,
// while food needs, outside shifts and resident energy remain active.
until(s=>{
 if(s.environment.economy.materials[19].available>=2)return true;
 // Routine care also supplies growing beds. Ask for deliberate extra turning
 // through the resident control instead of waiting for an unrequested surplus.
 const neighbour=s.residents.find(r=>r.id===0);
 if(!neighbour.help||['complete','cancelled'].includes(neighbour.help.phase))g.request(0,'compost',false);
 return false;
},'requested compost for soil work');
assert.equal(g.restore_plot(13,10),'ok');
const soilJob=snap().village.restoration.at(-1).id;
until(s=>s.village.restoration.find(j=>j.id===soilJob).finished!=null,'resident garden restoration');
assert.equal(snap().village.restoration.find(j=>j.id===soilJob).cancelled,false);
const restoredGarden=g.snapshot();assert(g.restore(restoredGarden));assert.equal(g.snapshot(),restoredGarden);
// Buying tools can satisfy routine demand; the Story introduction still asks
// the player to learn local crafting through one explicit workshop request.
if(!snap().village.progress.tools_crafted){
 const timber=Array(MATERIAL_KEYS.length).fill(0);timber[0]=Math.max(0,8-snap().environment.economy.materials[0].available);purchase(timber);
 until(s=>s.village.progress.tools_crafted>0||/Happy|already accepted/.test(g.request(1,'craft',false)),'request a saved tool batch');
}
await complete(4);
// Expanded food chapter: use actual plans, purchases, deliveries and resident work.
const rotationGarden=snap().village.buildings.find(b=>b.kind==='garden').id;
assert(g.configure_crop(rotationGarden,'beans',true));
build('coop');
const fodderGarden=build('garden');assert(g.configure_crop(fodderGarden,'fodder',true));
build('orchard');
build('goat_pasture');
build('apiary');
until(s=>s.village.buildings.find(b=>b.id===rotationGarden).agriculture.previous_crop==='beans','harvest a bean crop');
assert(g.configure_crop(rotationGarden,'maize',true));
await complete(5);
solar=build('solar_farm');const lamp=build('streetlight');
const b=snap().village.buildings.find(b=>b.id===lamp);
// Actual adjacent free path, without occupying the lamp's cell.
for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){if(!placementReason(snap().village,'road',b.x+dx,b.y+dy)){assert.equal(g.toggle_road(b.x+dx,b.y+dy),'ok');break;}}
cable(solar,lamp);
await complete(6);
for(const k of ['eco_toilet','wetland','banana_treatment'])build(k);
// A healthy pantry can leave mature crops waiting and new beds unplanted.
// Deliberately request tending to demonstrate reclaimed irrigation rather than
// expecting autonomous food work to manufacture demand for the chapter.
until(s=>{
 if(s.village.progress.reclaimed_irrigation)return true;
 const r=s.residents.find(r=>r.id===3);
 if(!r.help||r.help.finished!=null)g.request(3,'garden',false);
 return false;
},'resident tending with reclaimed irrigation');
await complete(7);
build('biodigester');g.configure_banana_treatment(false);
// Demonstrate a vegetable pot with cooking gas. Optional eggs can be waiting
// for a hen batch; use the normal preference control rather than idle for them.
g.set_food_preferences(snap().village.supplies.feed_hens,false);
await complete(8);
}
for(const material of [2,3,4])source(material);
for(let i=0;i<5;i++){
 until(s=>s.village.economy.sources[i].remaining>0,`source ${i} maturity`);
 assert.equal(g.harvest_source(i),'ok');until(s=>s.village.economy.sources[i].harvests>0,`source ${i} resident harvest`);
}
for(let tree=0;tree<4&&!snap().village.progress.timber_replanted;tree++){
 // Autonomous harvesting may finish the whole plot during earlier chapters.
 // Buy its actual replacement seedlings instead of waiting for cleared trees.
 const empty=s=>!s.village.economy.sources[timber].planted&&s.village.economy.sources[timber].harvests>0;
 until(s=>empty(s)||s.village.economy.sources[timber].remaining>=8,'timber maturity');
 if(empty(snap()))break;
 assert.equal(g.harvest_source(timber),'ok');
 const harvests=snap().village.economy.sources[timber].harvests;
 until(s=>s.village.economy.sources[timber].harvests>harvests,'whole timber tree harvest');
 if(!snap().village.economy.sources[timber].planted)break;
}
purchase(snap().environment.economy.shortage.map((n,i)=>i===22?n:0));
until(s=>s.village.progress.timber_replanted,'resident replanting from delivered timber seedlings');
build('home','adobe',true);
// Share deliberate surplus work while respecting each resident’s needs.
function gatherExtra(test,label){until(s=>{if(test(s))return true;for(const id of [0,3]){const r=s.residents.find(r=>r.id===id);if(!r.requested&&r.task!=='gather'&&r.task!=='garden'){if(id!==0||!g.request(id,'garden',false).includes('Happy'))g.request(id,'gather',false);}}return false;},label);}
gatherExtra(()=>g.sell_surplus(1)==='ok','sell surplus');
gatherExtra(()=>g.exchange_parts()==='ok','neighbour exchange');await complete(9);
const hydro=build('hydro');cable(hydro,solar);await complete(10);
// The expanded village needs a useful kitchen-to-square corridor before the
// final gathering. Use real road placement; delivery still uses resident work.
let tableRoads=0;
for(const [x,y] of [[11,11],[11,10],[11,9],[11,8],[12,8],[13,8],[13,7],[14,6],[14,5],[14,4],[15,3],[16,3],[17,3],[18,3]]){
 const v=snap().village;
 if(!v.roads.some(p=>p[0]===x&&p[1]===y)&&!placementReason(v,'road',x,y)){assert.equal(g.toggle_road(x,y),'ok');tableRoads++;}
}
assert(tableRoads>=8,'Invest in a useful delivery corridor as the village expands');
g.set_outside_work(false);
until(s=>s.village.situations.resolved_count>0||s.village.situations.active,'story check-in');
if(!snap().village.situations.resolved_count&&snap().village.situations.active.response==null)assert.equal(g.respond_situation('day_off'),'ok');
until(s=>{
 if(s.village.situations.resolved_count>0)return true;
 const concern=s.village.situations.active;
 const helper=s.residents.find(r=>r.id!==concern?.resident&&!r.trip);
 if(helper&&(!helper.help||helper.help.finished!=null))g.request(helper.id,'cook',false);
 return false;
},'follow through with a neighbour helping at the kitchen');
await complete(11);
until(()=>g.host_gathering()==='ok','second gathering');
gatherExtra(s=>s.village.food>=38,'healthy pantry');
// This low-level empty-property replay also exercises the shed's paid recipe;
// new game modes receive their founding shelter through start_mode instead.
if(!snap().village.buildings.some(b=>b.kind==='shed'))build('shed');
// A faster campaign can finish before anything needs service. The optional
// upkeep replay waits for real wear and paid, delivered resident service.
until(s=>s.village.maintenance.jobs.some(j=>j.finished!=null&&!j.cancelled),'complete an optional equipment service after natural wear',70*1920);
await complete(12);
const s=snap();assert(storyBuildingKinds.every(k=>s.village.buildings.some(b=>b.kind===k&&b.progress===100)));
for(const quest of quests)for(const objective of quest.objectives(s.village)){if(objective.action)assert.equal(goalRoute(s,objective).type,objective.action);}
assert.equal(s.village.mode,'story');assert.deepEqual(s.village.progress.later_completed,Array(9).fill(true));
const optionalLessons=quests.flatMap((q,chapter)=>q.options(s.village).map(o=>({chapter:chapter+1,label:o.label,value:o.value,target:o.target,done:o.done,guide:!!o.guide})));
assert(optionalLessons.every(o=>o.guide||o.done),'The all-path replay completes every optional lesson: '+JSON.stringify(optionalLessons.filter(o=>!o.guide&&!o.done)));
for(const q of quests)for(const objective of q.options(s.village))assert(goalRoute(s,objective),'Optional routes remain actionable');
await fs.writeFile(`${output}/report.json`,JSON.stringify({passed:true,route:process.env.SOLAR_STORY_FROM?'earned-checkpoint-continuation':'fresh-all-paths',checkpointSource:process.env.SOLAR_STORY_FROM||null,source:'Real placement, purchases, resident work and player commands; no authored progress or inventory',chapterResults,optionalLessons,buildingKinds:storyBuildingKinds,observations:s.village.progress.outcomes,serviceOrders,serviceSpending},null,2));
console.log(`Upkeep: ${serviceOrders} paid spare-part deliveries, R$ ${(serviceSpending/100).toFixed(2)}`);
g.free();console.log((process.env.SOLAR_STORY_FROM?'PASS: earned-checkpoint continuation; ':'PASS: ')+ 'all 13 chapters completed from a fresh Story through real placement, purchases, resident work, resource cycles, cooking, care and gatherings; every chapter saved/reloaded and all 22 building kinds taught.');
