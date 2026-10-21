import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {quests,questCompleted,storyBuildingKinds,goalRoute} from '../web/quests.js';
import {placementReason} from '../web/polish.js';
import {buyServiceParts} from './upkeep-playtest.mjs';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),snap=()=>JSON.parse(game.snapshot()),output=process.argv[2]||'artifacts/story';
await mkdir(output,{recursive:true});await mkdir('artifacts/logistics',{recursive:true});
const start=snap().village.minutes,from=Number(process.env.SOLAR_STORY_RESUME_CHAPTER||0),input=process.env.SOLAR_STORY_FROM;
if(input){assert(Number.isInteger(from)&&from>0&&from<=12);const raw=await readFile(input,'utf8');assert(game.restore(raw));assert.equal(game.snapshot(),raw);assert(quests.slice(0,from).every((_,i)=>questCompleted(snap().village,i)));console.log('Diagnostic continuation from earned chapter '+from);}

assert.equal(snap().village.version,35);
if(!input){assert(!snap().village.progress.completed.some(Boolean));assert.equal(snap().village.buildings.length,0);}
const checkpoints=[],pacing=[],orders=[],housingSetup=process.env.SOLAR_STORY_HOUSING_SETUP==='1';
let lastMaintenance=-Infinity,lastFoodOrder=-Infinity,savedCare=false;
const completeHelp=r=>!r.help||r.help.finished!=null;
function checkpoint(label){
 const saved=game.snapshot(),copy=new Game();assert(copy.restore(saved),label);assert.equal(copy.snapshot(),saved);copy.free();
 const report=JSON.parse(game.simulation_report());assert(report.materials.every(m=>m.difference===0),label+' materials');
 const w=report.water;for(let i=0;i<4;i++)assert(Math.abs(w.opening[i]+w.received[i]-w.consumed[i]-w.present[i])<.001,label+' water');
 const n=snap().village.power.network,a=n.account;assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-n.nodes.reduce((sum,p)=>sum+p.charge,0))<.001,label+' energy');
 return saved;
}
function maintain(s){
 const v=s.village;
 for(const [label,minutes] of [['first-fifteen-minutes-at-1x',2700],['first-week',7*1440]])if(!input&&v.minutes-start>=minutes&&!pacing.some(p=>p.label===label)){
  pacing.push({label,minutes:v.minutes,chapters:quests.filter((_,i)=>questCompleted(v,i)).length,buildings:v.buildings.map(b=>({kind:b.kind,progress:b.progress})),money:v.economy.money,needs:s.residents.map(r=>({name:r.name,hunger:r.hunger,energy:r.energy,social:r.social})),observations:v.progress.outcomes});
  writeFileSync(`${output}/${label}.json`,game.snapshot());
 }
 const care=v.situations.active;
 if(care&&care.resolved==null){
  if(!savedCare){writeFileSync(`${output}/care-check-in.json`,game.snapshot());savedCare=true;}
  if(care.response==null)assert.equal(game.respond_situation('share_shifts'),'ok');
  const helper=s.residents.find(r=>r.id!==care.resident&&!r.trip&&completeHelp(r)&&r.energy>=40&&r.hunger<=60);
  if(helper)game.request(helper.id,'cook',false);
 }
 if(v.minutes-lastMaintenance>=1440){lastMaintenance=v.minutes;buyServiceParts(game,s);}
 // A player can bridge an observed pantry period with a modest bought reserve.
 // Orders and trips are real; this never grants food, funds or achievement flags.
 const edible=[16,17,25,26].reduce((n,i)=>n+s.environment.economy.materials[i].stored,0);
 if(v.arrived&&edible<24&&v.minutes-lastFoodOrder>=360&&!v.economy.orders.some(o=>['confirmed','dispatched','collecting'].includes(o.status)&&(o.items[16]||o.items[17]))){
  const items=Array(s.environment.economy.materials.length).fill(0);items[16]=24;
  const driver=s.residents.find(r=>r.id===3&&!r.trip&&r.energy>=40&&r.hunger<=60);
  const pickup=driver&&v.minutes%1440>=480&&v.minutes%1440<900;
  const cost=24*s.environment.economy.materials[16].price+(pickup?2000:6000);
  if(v.economy.money>=cost){
   let result=pickup?game.order_supplies_pickup(JSON.stringify(items),driver.id):game.order_supplies(JSON.stringify(items));
   if(result!=='ok'&&pickup&&v.economy.money>=24*s.environment.economy.materials[16].price+6000)result=game.order_supplies(JSON.stringify(items));
   if(result==='ok'){lastFoodOrder=v.minutes;orders.push({minutes:v.minutes,reason:'Bridge the observed pantry reserve',pickup:snap().village.economy.orders.at(-1).pickup_by!=null,cost});}
  }
 }
}
function until(test,label,days=12){
 for(let frame=0;frame<days*1920;frame++){
  if(frame%20===0){const s=snap();maintain(s);if(test(snap()))return;}
  game.tick(.25);
 }
 const s=snap();writeFileSync(`${output}/stalled.json`,game.snapshot());
 throw Error(`Timed out ${label} on day ${1+Math.floor(s.village.minutes/1440)}: ${JSON.stringify({goals:quests[s.village.progress.tracked].objectives(s.village).filter(o=>!o.done),outcomes:s.village.progress.outcomes,shortage:s.environment.economy.shortage,people:s.residents.map(r=>[r.name,r.task,r.reason])})}`);
}
function buy(items,label='Project basket'){
 if(!items.some(Boolean))return;
 until(s=>s.village.economy.money>=items.reduce((n,q,i)=>n+q*s.environment.economy.materials[i].price,6000),'fund '+label,8);
 const s=snap(),driver=s.residents.find(r=>r.id===3&&!r.trip&&r.energy>=40&&r.hunger<=65);
 const pickup=driver&&s.village.minutes%1440>=480&&s.village.minutes%1440<900&&items.reduce((a,b)=>a+b,0)<=40;
 let result=pickup?game.order_supplies_pickup(JSON.stringify(items),driver.id):game.order_supplies(JSON.stringify(items));
 if(result!=='ok'&&pickup)result=game.order_supplies(JSON.stringify(items));
 assert.equal(result,'ok',label);
 orders.push({minutes:snap().village.minutes,reason:label,items,pickup:snap().village.economy.orders.at(-1).pickup_by!=null});
}
const sites={well:[7,12],home:[8,8],garden:[13,10],kitchen:[10,10],grove:[6,14],square:[8,17],coop:[14,13],solar_farm:[17,6],streetlight:[14,8],eco_toilet:[8,10],wetland:[14,17],biodigester:[12,16]};
function build(kind,site=sites[kind],recipe='standard'){
 const [x,y]=site;assert.equal(game.place_with_recipe(kind,x,y,recipe),'ok',kind+' placement');
 const id=snap().village.buildings.at(-1).id;
 assert.equal(game.configure_project(id,3,false,recipe),'ok');
 buy(snap().environment.economy.shortage,kind+' materials');
 until(s=>s.village.buildings.find(b=>b.id===id).progress>=100,'finish '+kind,12);
 console.log(`${kind} ready · day ${1+Math.floor(snap().village.minutes/1440)}`);return id;
}
function roads(points){for(const [x,y]of points){const v=snap().village;if(!v.roads.some(p=>p[0]===x&&p[1]===y)&&!placementReason(v,'road',x,y))assert.equal(game.toggle_road(x,y),'ok');}}
function cable(fromBuilding,toBuilding){
 const nodes=snap().village.power.network.nodes,port=id=>nodes.find(n=>n.owner.kind==='building'&&n.owner.id===id).id;
 const quote=JSON.parse(game.electrical_connection_quote(port(fromBuilding),port(toBuilding)));assert(quote.allowed,quote.reason);
 assert.equal(game.queue_electrical_connection(port(fromBuilding),port(toBuilding)),'ok');const id=snap().village.pipes.lines.at(-1).id;
 buy(snap().environment.economy.shortage,'Electrical connection kit');
 until(s=>s.village.pipes.lines.find(p=>p.id===id).phase==='active','install paid electrical connection',8);checkpoint('installed cable');
}
async function chapter(index){
 until(s=>questCompleted(s.village,index),quests[index].title,index===12?44:12);
 const s=snap();assert(quests[index].objectives(s.village).every(o=>o.done),'Native/UI objectives agree: '+quests[index].title);
 assert(game.track_quest(Math.min(index+1,12)));
 const saved=checkpoint(quests[index].title);
 await writeFile(`${output}/solar-${index===0?'intro':index===12?'complete':`chapter-${index+1}`}.json`,saved);
 checkpoints.push({chapter:index+1,name:quests[index].title,day:1+Math.floor(s.village.minutes/1440),minutes:s.village.minutes,money:s.village.economy.money,buildings:s.village.buildings.length});
 console.log(`Chapter ${index+1}/13: ${quests[index].title} · day ${checkpoints.at(-1).day}`);
}
if(from<=0){
assert(game.set_resident_job(4,true));
until(s=>s.village.arrived,'arrival');
build('well');build('home');build('garden');build('kitchen');
until(s=>{if(s.village.harvests>0)return true;const r=s.residents.find(r=>r.id===0);if(completeHelp(r))game.request(0,'garden',false);return false;},'first requested harvest');
await chapter(0);
}
if(from<=1){
build('grove');assert.equal(game.place_source(1,4,18),'ok');
until(s=>{if(s.village.progress.fruit>=6)return true;const r=s.residents.find(r=>r.id===0);if(completeHelp(r))game.request(0,'gather',false);return false;},'gather first food-forest fruit');
if(!housingSetup)build('home',[12,7]);
await chapter(1);
}
if(from<=2){
assert(game.set_resident_job(1,false));
build('square');
roads([...Array.from({length:11},(_,i)=>[10,i+7]),[9,15],[10,18],[10,19],[9,19],[8,19]]);
until(()=>game.host_gathering()==='ok','plan welcome supper');await chapter(2);
}
if(from<=3){
// The completed welcome-table corridor and nearby home supply trips satisfy
// the local-delivery lesson; income and previous actual purchases also count.
await chapter(3);
}
if(from<=4){
const basket=Array(snap().environment.economy.materials.length).fill(0);basket[15]=4;basket[19]=2;
buy(basket,'Bought tools and mature compost');
const garden=snap().village.buildings.find(b=>b.kind==='garden').id;
until(s=>s.environment.economy.materials[19].available>=2,'compost receipt');
assert.equal(game.restore_plot(13,10),'ok');
until(s=>{
 if(s.village.progress.outcomes.soil_improved&&(s.village.simulation.materials.spent[15]||0)>0)return true;
 const r=s.residents.find(r=>r.id===0);if(completeHelp(r))game.request(0,'garden',false);return false;
},'use bought tools and restore soil');
await chapter(4);
}
if(from<=5){
build('coop');await chapter(5);
}
if(from<=6){
const solar=build('solar_farm'),lamp=build('streetlight');roads([[14,9],[14,10],[15,8],[16,8]]);cable(solar,lamp);await chapter(6);
}
if(from<=7){
build('eco_toilet');build('wetland');
until(s=>{
 if(s.village.progress.reclaimed_irrigation)return true;
 const r=s.residents.find(r=>r.id===3);if(completeHelp(r))game.request(3,'garden',false);return false;
},'use actually reclaimed irrigation');
await chapter(7);
}
if(from<=8){
build('biodigester');game.configure_banana_treatment(false);game.set_food_preferences(true,false);
await chapter(8);
}
if(housingSetup){
 assert.equal(snap().village.buildings.filter(b=>b.kind==='home'&&b.progress>=100).length,1);
 assert(quests.slice(0,9).every((_,i)=>questCompleted(snap().village,i)));
 await writeFile(`${output}/housing-start.json`,checkpoint('earned one-home housing baseline'));
 await writeFile(`${output}/report.json`,JSON.stringify({passed:true,route:'fresh-one-home-housing-setup',checkpoints,pacing,orders,days:(snap().village.minutes-start)/1440},null,2));
 game.free();console.log('PASS: nine earned Story chapters with one home, ready for a real second-home planning comparison.');
 process.exit(0);
}
if(from<=9)await chapter(9);
if(from<=10)await chapter(10);
if(from<=11){
assert(game.set_resident_job(4,false));
await chapter(11);
}
if(from<=12){
until(()=>game.host_gathering()==='ok','plan second gathering');await chapter(12);
}
const end=snap(),kinds=new Set(end.village.buildings.map(b=>b.kind));
assert(kinds.size<storyBuildingKinds.length,'The required campaign must not collect every building');
for(const kind of ['warehouse','workshop','greenhouse','orchard','goat_pasture','apiary','banana_treatment','hydro'])assert(!kinds.has(kind),kind+' remains optional');
for(const q of quests)for(const objective of [...q.objectives(end.village),...q.options(end.village)]){
 assert(Number.isFinite(objective.value)&&Number.isFinite(objective.target));
 assert(goalRoute(end,objective),'Every required and optional lesson has an actionable route');
}
await writeFile(`${output}/report.json`,JSON.stringify({passed:true,route:input?'earned-checkpoint-diagnostic':'fresh-minimal',checkpointSource:input||null,source:'Only real public game commands; no authored inventories, progress or completed buildings',checkpoints,pacing,orders,days:(end.village.minutes-start)/1440,buildingKinds:[...kinds],optionalNotBuilt:storyBuildingKinds.filter(k=>!kinds.has(k)),outcomes:end.village.progress.outcomes},null,2));
game.free();console.log(input?'PASS: earned-checkpoint diagnostic completes the remaining Story through real commands and exact saves.':'PASS: fresh thirteen-chapter Story through observed outcomes, real purchases, delivered inputs, resident work and gatherings; alternative buildings remain optional; exact chapter checkpoints and all resource accounts.');
