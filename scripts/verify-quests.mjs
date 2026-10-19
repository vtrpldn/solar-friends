import {writeFileSync} from 'node:fs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import init,{Game} from '../web/pkg/solar_friends.js';
import {quests,questCompleted,storyBuildingKinds,goalRoute} from '../web/quests.js';
import {placementReason} from '../web/polish.js';
import {sourceKinds} from '../web/resource-sites.js';
await init({module_or_path:await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),snap=()=>JSON.parse(g.snapshot()),output=process.argv[2]||'artifacts/story';
if(output)await fs.mkdir(output,{recursive:true});
await fs.mkdir('artifacts/logistics',{recursive:true});
g.set_outside_work(true);
let savedCareCheckIn=false;
function until(test,label,limit=24000){
 for(let i=0;i<limit;i++){
  const current=snap(),care=current.village.situations.active;
  if(output&&!savedCareCheckIn&&care&&care.response==null&&care.resolved==null){writeFileSync(`${output}/care-check-in.json`,g.snapshot());savedCareCheckIn=true;}
  if(test(current))return;g.tick(.25);
 }
 const s=snap(),chapter=s.village.progress.tracked;writeFileSync('artifacts/logistics/stalled-story.json',g.snapshot());
 throw new Error(`Timed out: ${label} on day ${1+Math.floor(s.village.minutes/1440)}. ${JSON.stringify({chapter,goals:quests[chapter].objectives(s.village).filter(o=>!o.done),stock:s.environment.economy.shortage,residents:s.residents.map(r=>[r.name,r.task,r.reason]),progress:s.village.progress})}`);
}
function location(kind){
 const v=snap().village;
 // Leave access corridors between plots; continuous first-fit rows create walls.
 if(kind!=='hydro')for(const y of [5,9,13,17,21,25])for(const x of [5,9,13,17,21])if(!placementReason(v,kind,x,y))return [x,y];
 if(kind==='hydro')for(let y=5;y<=25;y++)for(let x=23;x<=26;x++)if(!placementReason(v,kind,x,y))return [x,y];
 throw Error(`No accessible planned plot for ${kind}`);
}
function purchase(items){if(!items.some(Boolean))return;until(s=>s.environment.economy.money>=items.reduce((n,q,i)=>n+q*s.environment.economy.materials[i].price,6000),'purchase funds');assert.equal(g.order_supplies(JSON.stringify(items)),'ok');}
function build(kind,recipe='standard',local=false,site=null){
 const [x,y]=site||location(kind);assert.equal(g.place_with_recipe(kind,x,y,recipe),'ok',`${kind} placement`);
 const id=snap().village.buildings.at(-1).id;
 const missing=snap().environment.economy.shortage;
 if(local){for(const i of [5,6,7,8])missing[i]=0;missing[0]+=12;missing[2]+=20;missing[4]+=6;}
 purchase(missing);
 const started=snap().village.minutes;
 // Local construction includes extraction, processing and several community
 // work windows. Keep a finite sixteen-day bound for a complete building.
 until(s=>s.village.buildings.find(b=>b.id===id).progress>=100,`build ${kind}`,16*1920);
 if(kind==='home'&&recipe==='adobe')console.log(`Local adobe home: ${((snap().village.minutes-started)/1440).toFixed(1)} game days from blueprint to completion`);
 return id;
}
function source(material){const [x,y]=location(sourceKinds[material]);assert.equal(g.place_source(material,x,y),'ok');return snap().village.economy.sources.length-1;}
async function complete(chapter){
 until(s=>questCompleted(s.village,chapter),quests[chapter].title);
 // Earlier valid effort may finish two newly unlocked chapters in one tick.
 // Select the next journal page through its real command for reproducible UI checkpoints.
 assert(g.track_quest(Math.min(chapter+1,quests.length-1)));
 const saved=g.snapshot(),s=snap();assert(quests[chapter].objectives(s.village).every(o=>o.done),`Rust and UI agree: ${quests[chapter].title}`);
 assert(g.restore(saved),`reload chapter ${chapter+1}`);assert.equal(g.snapshot(),saved);
 assert.equal(s.village.progress.tracked,Math.min(chapter+1,quests.length-1));
 if(output)await fs.writeFile(`${output}/solar-${chapter===0?'intro':chapter===12?'complete':`chapter-${chapter+1}`}.json`,saved);
 console.log(`Chapter ${chapter+1}/${quests.length}: ${quests[chapter].title} · day ${1+Math.floor(s.village.minutes/1440)}`);
 if(chapter<quests.length-2){
  const earned=quests.slice(0,chapter+2).every((_,i)=>questCompleted(s.village,i));
  assert.equal(g.track_quest(chapter+2),earned,'journal access follows completed prerequisites, including earlier valid effort');
  assert(g.track_quest(chapter+1));
 }
}
until(s=>s.village.arrived,'arrival');
// Keep daily food and shelter near the arrival store, then expand along corridors.
for(const [kind,x,y] of [['well',6,10],['home',8,8],['garden',13,10],['kitchen',10,10],['home',12,7]])build(kind,'standard',false,[x,y]);
await complete(0);
build('grove');const timber=source(0),bamboo=source(1);await complete(1);
build('square');
until(s=>s.village.progress.social_mask===31&&g.host_gathering()==='ok','welcome supper');
await complete(2);
build('warehouse');
const basket=Array(15).fill(0);basket[0]=1;
until(()=>g.order_supplies_pickup(JSON.stringify(basket),3)==='ok','resident pickup');
until(()=>g.contribute_tool_library()==='ok','tool library');await complete(3);
for(const k of ['workshop','compost','greenhouse'])build(k);
await complete(4);
build('coop');await complete(5);
build('solar_farm');const lamp=build('streetlight');
const b=snap().village.buildings.find(b=>b.id===lamp);
// Actual adjacent free path, without occupying the lamp's cell.
for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){if(!placementReason(snap().village,'road',b.x+dx,b.y+dy)){assert.equal(g.toggle_road(b.x+dx,b.y+dy),'ok');break;}}
await complete(6);
for(const k of ['eco_toilet','wetland','banana_treatment'])build(k);await complete(7);
build('biodigester');await complete(8);
for(const material of [2,3,4])source(material);
for(let i=0;i<5;i++){
 until(s=>s.village.economy.sources[i].remaining>0,`source ${i} maturity`);
 assert.equal(g.harvest_source(i),'ok');until(s=>s.village.economy.sources[i].harvests>0,`source ${i} resident harvest`);
}
for(let tree=0;tree<4&&!snap().village.progress.timber_replanted;tree++){
 until(s=>s.village.economy.sources[timber].remaining>=8,'timber maturity');assert.equal(g.harvest_source(timber),'ok');
 const harvests=snap().village.economy.sources[timber].harvests;
 until(s=>s.village.economy.sources[timber].harvests>harvests,'whole timber tree harvest');
 if(!snap().village.economy.sources[timber].planted)break;
}
until(s=>s.village.progress.timber_replanted,'resident replanting');
build('home','adobe',true);
// Share deliberate surplus work within normal hours; no after-hours foraging shift.
function gatherExtra(test,label){until(s=>{if(test(s))return true;for(const id of [0,3]){const r=s.residents.find(r=>r.id===id);if(r.task!=='gather'&&!r.requested)g.request(id,'gather',false);}return false;},label);}
gatherExtra(()=>g.sell_surplus(1)==='ok','sell surplus');
gatherExtra(()=>g.exchange_parts()==='ok','neighbour exchange');await complete(9);
build('hydro');await complete(10);
g.set_outside_work(false);
until(s=>s.village.situations.resolved_count>0||s.village.situations.active,'story check-in');
if(!snap().village.situations.resolved_count&&snap().village.situations.active.response==null)assert.equal(g.respond_situation('day_off'),'ok');
await complete(11);
until(()=>g.host_gathering()==='ok','second gathering');
gatherExtra(s=>s.village.food>=38,'healthy pantry');await complete(12);
const s=snap();assert(storyBuildingKinds.every(k=>s.village.buildings.some(b=>b.kind===k&&b.progress===100)));
for(const quest of quests)for(const objective of quest.objectives(s.village)){if(objective.action)assert.equal(goalRoute(s,objective).type,objective.action);}
assert.equal(s.village.mode,'story');assert.deepEqual(s.village.progress.later_completed,Array(9).fill(true));
g.free();console.log('PASS: all 13 chapters completed from a fresh Story through real placement, purchases, resident work, resource cycles, cooking, care and gatherings; every chapter saved/reloaded and all 18 building kinds taught.');
