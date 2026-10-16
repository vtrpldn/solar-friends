import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';
import {placementReason} from '../web/polish.js';
import {buyServiceParts} from './upkeep-playtest.mjs';
const wasm=await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url));
await init({module_or_path:wasm});
const output=process.env.SOLAR_HOUSING_OUTPUT||'artifacts/housing-balance';await mkdir(output,{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),work=new Set(['build','building_work','haul','water','utility','restore','source','prepare','craft','cook','compost','garden','gather']),leisure=new Set(['idle','nature_walk','birdwatch','stretch','daydream','stargaze','socialize','rest']);
let phase='common',checkpoints=0,lastCare=new WeakMap();
const payHistory=new WeakMap();
function checkpoint(g,label){
 const raw=g.snapshot(),copy=new Game();assert(copy.restore(raw),label);assert.equal(copy.snapshot(),raw,label);copy.free();
 const report=JSON.parse(g.simulation_report());assert(report.materials.every(m=>m.difference===0),label+' materials');
 const w=report.water;for(let i=0;i<4;i++)assert(Math.abs(w.opening[i]+w.received[i]-w.consumed[i]-w.present[i])<.001,label+' liquid '+i);
 const n=snap(g).village.power.network,a=n.account;assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-n.nodes.reduce((sum,p)=>sum+p.charge,0))<.001,label+' energy');
 checkpoints++;return raw;
}
function maintain(g,s){
 const v=s.village,previous=lastCare.get(g)??-Infinity;
 const pay=payHistory.get(g);if(pay&&pay.day!==v.economy.work_day[4]&&v.economy.work_day[4]>=0){pay.total+=22000;pay.day=v.economy.work_day[4];}
 if(v.minutes-previous>=1440){lastCare.set(g,v.minutes);buyServiceParts(g,s);checkpoint(g,phase+' daily');}
 const care=v.situations.active;if(care&&care.resolved==null){
  if(care.response==null)assert.equal(g.respond_situation('share_shifts'),'ok');
  const helper=s.residents.find(r=>r.id!==care.resident&&!r.trip&&!(care.helpers&(1<<r.id))&&(!r.help||r.help.finished!=null));
  if(helper)g.request(helper.id,'cook',false);
 }
}
function until(g,test,label,days=20,onSample=()=>{}){
 for(let tick=0;tick<days*1920;tick++){
  if(tick%20===0){const s=snap(g);maintain(g,s);onSample(s);if(test(snap(g)))return;}
  g.tick(.25);
 }
 writeFileSync(output+'/'+phase+'-stalled.json',g.snapshot());throw Error(label+' timed out; see '+output+'/'+phase+'-stalled.json');
}
function buy(g,items,label){
 if(!items.some(Boolean))return;
 const total=()=>{const materials=snap(g).environment.economy.materials;return items.reduce((sum,n,i)=>sum+n*materials[i].price,6000);};
 until(g,s=>s.village.economy.money>=total(),'earn funds: '+label,16);
 assert.equal(g.order_supplies(JSON.stringify(items)),'ok',label);checkpoint(g,label+' receipt');
}
function build(g,kind,x,y){
 assert.equal(g.place(kind,x,y),'ok',kind);const id=snap(g).village.buildings.at(-1).id;
 assert.equal(g.configure_project(id,3,false,'standard'),'ok');buy(g,snap(g).environment.economy.shortage,kind);
 until(g,s=>s.village.buildings.find(b=>b.id===id).progress>=100,'build '+kind);console.log(phase+': '+kind+' ready');return id;
}
const line=(g,id)=>snap(g).village.pipes.lines.find(p=>p.id===id);
function cable(g,to){
 const source=snap(g).village.power.network.nodes.filter(n=>n.kind==='solar').map(n=>({id:n.id,quote:JSON.parse(g.electrical_connection_quote(n.id,to))})).filter(p=>p.quote.allowed).sort((a,b)=>a.quote.plan.cells.length-b.quote.plan.cells.length)[0];
 assert(source,'A real solar source must reach the new equipment');assert.equal(g.queue_electrical_connection(source.id,to),'ok');const id=snap(g).village.pipes.lines.at(-1).id;
 buy(g,snap(g).environment.economy.shortage,'cable kit');until(g,()=>line(g,id).phase==='active','resident cable installation');checkpoint(g,'installed cable');return id;
}
function liquid(g,kind,from,to){
 const quote=JSON.parse(g.water_connection_quote(kind,from,to));assert(quote.allowed,quote.reason);
 assert.equal(g.queue_water_connection(kind,from,to),'ok');const id=snap(g).village.pipes.lines.at(-1).id;
 buy(g,snap(g).environment.economy.shortage,kind+' kit');until(g,()=>line(g,id).phase==='active','resident '+kind+' installation');console.log(phase+': '+kind+' installed');
 const pump=snap(g).village.power.network.nodes.find(n=>n.owner.kind==='pump'&&n.owner.id===id);assert(pump);cable(g,pump.id);return id;
}
const common=new Game();
if(process.env.SOLAR_HOUSING_COMMON){assert(common.restore(await readFile(process.env.SOLAR_HOUSING_COMMON,'utf8')));}
else{
 const raw=await readFile(output+'/bootstrap/housing-start.json','utf8'),old=JSON.parse(raw);assert(common.restore(raw));
 assert.deepEqual(snap(common).village,old.village);assert.deepEqual(snap(common).residents,old.residents);
 assert.equal(snap(common).village.buildings.filter(b=>b.kind==='home').length,1);
 build(common,'warehouse',6,10);build(common,'workshop',17,12);
 const well=snap(common).village.buildings.find(b=>b.kind==='well').id;
 const node=snap(common).village.power.network.nodes.find(n=>n.owner.kind==='building'&&n.owner.id===well).id;cable(common,node);
 for(let id=0;id<5;id++)assert(common.set_resident_job(id,false));
 until(common,s=>s.village.minutes%1440>=570&&s.village.minutes%1440<630&&s.residents.every(r=>!r.trip&&r.task!=='sleep'),'align actual morning',3);
}
const baseline=checkpoint(common,'identical earned housing baseline');await writeFile(output+'/common.json',baseline);
const initial=snap(common),workshop=initial.village.buildings.find(b=>b.kind==='workshop'),well=initial.village.buildings.find(b=>b.kind==='well').id,wetland=initial.village.buildings.find(b=>b.kind==='wetland').id;
assert.equal(initial.village.buildings.filter(b=>b.kind==='home').length,1,'Compare a genuinely occupied second home');
assert.equal(initial.village.progress.outcomes.best_housing_spend,null,'Each strategy earns its own housing result');
const routes=[];
for(let x=3;x<=24;x++)for(let y=3;y<=24;y++){
 if(placementReason(initial.village,'home',x,y))continue;
 const a=JSON.parse(common.route_quote(10,15,x,y+2)).route,b=JSON.parse(common.route_quote(workshop.x,workshop.y+2,x,y+2)).route;
 if(a&&b)routes.push({x,y,minutes:a.minutes+b.minutes,camp:a.minutes,workshop:b.minutes,land:JSON.parse(common.land_preview('home',x,y))});
}
routes.sort((a,b)=>a.minutes-b.minutes);assert(routes.length>2);const near=routes[0],far=routes.at(-1);assert(far.minutes>near.minutes*1.8);
await writeFile(output+'/plots.json',JSON.stringify({near,far},null,2));common.free();
const cases=[{name:'near-bought',plot:near,outside:true},{name:'far-bought',plot:far,outside:true},{name:'near-local-adobe',plot:near,outside:true,local:true},{name:'near-village-time',plot:near,outside:false},{name:'near-building-preference',plot:near,outside:true,preference:true}];
const results=[];
for(const choice of cases.filter(c=>!process.env.SOLAR_HOUSING_CASE||c.name===process.env.SOLAR_HOUSING_CASE)){
 phase=choice.name;const g=new Game();assert(g.restore(baseline));assert.equal(g.snapshot(),baseline);assert(g.set_resident_job(4,choice.outside));
 if(choice.preference){assert.equal(g.set_work_preference(1,'construction',2),'ok');assert.equal(g.set_work_preference(1,'hauling',2),'ok');}
 const before=snap(g),start=before.village.minutes,counts=before.residents.map(()=>({awake:0,work:0,leisure:0,travel:0,construction:0,indoorSleep:0}));let peakHunger=0,minEnergy=100;
 payHistory.set(g,{day:before.village.economy.work_day[4],total:0});
 function sample(s){
  for(const r of s.residents){const c=counts[r.id];if(!r.trip&&r.task!=='sleep')c.awake++;if(!r.trip&&r.task==='sleep')c.indoorSleep++;if(!r.trip&&work.has(r.task))c.work++;if(!r.trip&&leisure.has(r.task))c.leisure++;if(!r.trip&&Math.hypot(r.x-r.target_x,r.y-r.target_y)>.08)c.travel++;if(r.task==='build'&&r.activity_building===home)c.construction++;
   peakHunger=Math.max(peakHunger,r.hunger);minEnergy=Math.min(minEnergy,r.energy);assert(r.hunger<95&&r.energy>20,'Housing plans must preserve food and rest');}
 }
 const {x,y}=choice.plot,recipe=choice.local?'adobe':'standard';assert.equal(g.place_with_recipe('home',x,y,recipe),'ok');const home=snap(g).village.buildings.at(-1).id;
 assert.equal(g.configure_project(home,3,false,recipe),'ok');
 if(choice.local){const requested=g.harvest_source(0);assert.equal(requested,'ok','Renewable bamboo harvest');}
 const basket=snap(g).environment.economy.shortage;
 if(choice.local){basket[7]=0;basket[1]=0;basket[2]+=6;basket[0]=Math.max(basket[0],3);}
 buy(g,basket,'housing supplies');await writeFile(output+'/'+phase+'-planned.json',checkpoint(g,'home planned'));
 const forecast=JSON.parse(g.project_forecast(7));assert(forecast.projects.some(p=>p.building===home));
 until(g,s=>s.village.buildings.find(b=>b.id===home).progress>=100,'second home',24,sample);
 const completed=snap(g),constructionDays=(completed.village.minutes-start)/1440;await writeFile(output+'/'+phase+'-built.json',checkpoint(g,'home built'));
 console.log(phase+': resident-built second home in '+constructionDays.toFixed(2)+' days');
 const fresh=liquid(g,'fresh',well,home),grey=liquid(g,'greywater',home,wetland);
 const installed=snap(g),operateAt=installed.village.minutes;let dryMinutes=0,last=operateAt;
 until(g,s=>s.village.minutes-operateAt>=14*1440&&dryMinutes>=7*1440,'fourteen operating days including seven dry days',55,s=>{
  sample(s);if(s.environment.weather.forecast[0].season==='dry')dryMinutes+=s.village.minutes-last;last=s.village.minutes;
 });
 const after=snap(g);await writeFile(output+'/'+phase+'-after.json',checkpoint(g,'operating occupied home'));assert(line(g,fresh).transferred>0&&line(g,grey).transferred>0,'Both real local routes must serve the occupied home');
 const net=after.village.progress.outcomes.net_spending-before.village.progress.outcomes.net_spending,income=payHistory.get(g).total;
 assert.equal(after.village.economy.money,before.village.economy.money+income-net,'Outside income and purchases reconcile with the actual fund');
 const result={name:phase,plot:choice.plot,recipe,outside:choice.outside,preferences:after.village.workforce.preferences,constructionDays,installationDays:(operateAt-completed.village.minutes)/1440,operatingDays:(after.village.minutes-operateAt)/1440,dryDays:dryMinutes/1440,openingFund:before.village.economy.money,closingFund:after.village.economy.money,income,netExternalSpending:net,housingSpend:completed.village.progress.outcomes.best_housing_spend,tilesProduced:after.village.production.accounting.outputs[7]-before.village.production.accounting.outputs[7],materialUse:after.village.simulation.materials.spent.map((n,i)=>n-before.village.simulation.materials.spent[i]),landAfter:JSON.parse(g.land_preview('home',x,y)),peakHunger,minEnergy,fresh:line(g,fresh).transferred,greywater:line(g,grey).transferred,residents:counts.map(c=>({...c,leisureShare:c.leisure/c.awake})),forecast};
 assert(result.residents.every(c=>c.leisureShare>.5),'Every resident retains majority waking village leisure');
 assert(counts[3].indoorSleep>0&&counts[4].indoorSleep>0,'The second home actually shelters the previously unhoused residents');
 await writeFile(output+'/'+phase+'-after.json',checkpoint(g,'operating occupied home'));results.push(result);console.log(JSON.stringify({name:phase,constructionDays,netExternalSpending:net,income,leisure:Math.min(...result.residents.map(r=>r.leisureShare))}));
 if(choice.name==='far-bought'){
  const started=snap(g).village.minutes,spent=snap(g).village.progress.outcomes.net_spending;
  assert.equal(g.queue_building_work(home,'move',near.x,near.y),'ok','Recover a poor plot through real resident relocation');
  const active=kind=>snap(g).village.pipes.lines.find(p=>p.phase==='active'&&p.plan.kind===kind&&(kind==='fresh'?p.plan.from===well&&p.plan.to===home:p.plan.from===home&&p.plan.to===wetland));
  let lastSupply=-Infinity;
  until(g,s=>{
   if(s.village.minutes-lastSupply>=1440){lastSupply=s.village.minutes;buy(g,s.environment.economy.shortage,'relocated connection parts');}
   return !s.village.building_jobs.some(j=>j.building===home)&&s.village.buildings.find(b=>b.id===home).progress>=100&&active('fresh')&&active('greywater');
  },'real home relocation and resident utility reinstallation',24);
  const startFlows=[active('fresh').transferred,active('greywater').transferred];
  until(g,()=>active('fresh').transferred>startFlows[0]&&active('greywater').transferred>startFlows[1],'restored local service after relocation',5);
  result.recovery={to:[near.x,near.y],days:(snap(g).village.minutes-started)/1440,netExternalSpending:snap(g).village.progress.outcomes.net_spending-spent,fresh:active('fresh').transferred-startFlows[0],greywater:active('greywater').transferred-startFlows[1]};
  await writeFile(output+'/'+phase+'-recovered.json',checkpoint(g,'recovered occupied home'));console.log(phase+': recovered near home and both real services');
 }
 await writeFile(output+'/report.json',JSON.stringify({passed:false,wasm_sha256:createHash('sha256').update(wasm).digest('hex'),checkpoints,results},null,2));g.free();
}
if(!process.env.SOLAR_HOUSING_CASE){
 const [a,b,c,d,e]=results;assert.equal(results.length,5);assert(b.constructionDays>a.constructionDays,'A distant supplied home costs actual resident time');assert(c.tilesProduced>=6&&c.housingSpend<a.housingSpend,'Locally made roofing trades labour for external housing spending');assert(a.income>d.income,'An outside occupation contributes real income');assert.notDeepEqual(a.residents.map(r=>r.construction),e.residents.map(r=>r.construction),'Work preferences affect actual crew participation');
}
await writeFile(output+'/report.json',JSON.stringify({passed:true,diagnostic:!!(process.env.SOLAR_HOUSING_CASE||process.env.SOLAR_HOUSING_COMMON||process.env.SOLAR_HOUSING_REUSE),source:'Story commands, then exact independent copies of one earned one-home village; no authored inventory, money, clock, buildings or progress',wasm_sha256:createHash('sha256').update(wasm).digest('hex'),checkpoints,results},null,2));
console.log('PASS: '+results.length+' earned second-home planning paths, actual paid resident utility installation, dry-period operation, healthy needs, majority leisure, exact saves and all physical accounts.');
