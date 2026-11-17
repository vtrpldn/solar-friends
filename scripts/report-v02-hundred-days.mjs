import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createWeekend,chooseCamp,enableFastNavigation,plan,placementError,tick,PROJECTS,PROCESSES,save,restore,repeatProduction,supplyRun,materialCount,blueprintPurchase} from '../web/v02/weekend/simulation.js';
import {ensureNaturalLand} from '../web/v02/weekend/natural-resources.js';
import {setOutsideWork} from '../web/v02/weekend/outside-work.js';
import {LabRunner} from '../web/v02/weekend/lab-runner.js';
import {GAME_DAY,seasonAt} from '../web/v02/weekend/biological-production.js';
import {spendableMoney} from '../web/v02/weekend/procurement-budget.js';
import {economyPolicies} from '../web/v02/weekend/economy-policies.js';
const option=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')??fallback;
const days=Number(option('days',100)),seed=Number(option('seed',42));
assert(Number.isInteger(days)&&days>0&&days<=365);
const output=option('output','artifacts/hundred-days');fs.mkdirSync(output,{recursive:true});
let s=createWeekend(seed);chooseCamp(s,'entrance');ensureNaturalLand(s,PROJECTS);enableFastNavigation(s);
const initialMoney=s.money,started=performance.now(),samples=[],orders=[],issues=[],starvation=Object.fromEntries(s.people.map(r=>[r.id,0])),maxStarvation={...starvation};
const runner=new LabRunner(s,(state,dt)=>{
 tick(state,dt);
 for(const r of state.people){starvation[r.id]=r.needs.hunger<5?starvation[r.id]+dt:0;maxStarvation[r.id]=Math.max(maxStarvation[r.id],starvation[r.id]);}
});runner.speed=1024;runner.paused=false;
setOutsideWork(s,s.people[0],true);setOutsideWork(s,s.people[1],true);
function place(key){
 const quote=blueprintPurchase(s,key);if(quote.error)return false;
 let spot;
 for(let radius=3;radius<=25&&!spot;radius++){
  for(let z=s.stock.z-radius;z<=s.stock.z+radius&&!spot;z++)for(let x=s.stock.x-radius;x<=s.stock.x+radius&&!spot;x++)
   if(Math.max(Math.abs(x-s.stock.x),Math.abs(z-s.stock.z))===radius&&!placementError(s,key,x,z))spot={x,z};
 }
 if(!spot)return false;
 const error=plan(s,key,spot.x,spot.z);orders.push({day:s.time/GAME_DAY,key,...spot,error});assert.equal(error,'');return true;
}
for(const key of ['gathering','water','toilet','shelter','covered-stores'])place(key);
const expansion=['garden','groundwater-well','home-cottage','workshop','kitchen','compost','solar_farm','coop'];
const recipes={garden:'vegetables',kitchen:'meals',compost:'compost',coop:'eggs'};
function manage(day){
 // A reproducible player policy: keep two paid jobs, maintain food and supplies,
 // expand only above a R$900 uncommitted-cash threshold, and never inject assets or money.
 const pending=s.projects.filter(p=>!p.natural&&p.work<PROJECTS[p.key].work);
 if(day>=4&&pending.length<2&&spendableMoney(s)>900){
  const key=expansion.find(key=>!s.projects.some(p=>p.key===key));if(key)place(key);
 }
 for(const p of s.projects){
  if(p.work<PROJECTS[p.key].work)continue;
  const recipe=recipes[p.key];if(recipe&&!p.repeat)repeatProduction(s,p.id,recipe);
  if(recipe)p.stockTarget=recipe==='vegetables'?60:recipe==='eggs'?24:36;
 }
 const policies=economyPolicies(s);policies.sales.eggs={enabled:true,keep:12,above:24,daily:24};
 for(const id of ['seedlings','fodder','tools','hardware']){
  const needed=id==='fodder'?s.projects.some(p=>p.key==='coop'):id==='seedlings'?s.projects.some(p=>p.key==='garden'):true;
  if(needed&&materialCount(s,id)<(id==='fodder'?6:2)&&spendableMoney(s)>300)supplyRun(s,id);
 }
}
function checkFinite(value,label='state'){
 if(typeof value==='number')assert(Number.isFinite(value),`${label}: non-finite number`);
 else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value))checkFinite(item,`${label}.${key}`);
}
function sample(day){
 const f=s.finances;checkFinite(s);assert(s.money>=0,'cash never negative');
 assert(Math.abs(s.money-(f.opening+f.income-f.expenses))<.011,'cash matches its ledger');
 for(const [id,n]of Object.entries(s.materials))assert(n>=-1e-8,`${id}: negative stock`);
 for(const r of s.people)for(const [key,n]of Object.entries(r.needs))assert(n>=0&&n<=100,`${r.id}: invalid ${key}`);
 const row={day,time:s.time,money:s.money,food:s.materials.food,meals:s.materials.meals,season:seasonAt(s.time),
  needs:s.people.map(r=>({id:r.id,energy:r.energy,...r.needs,action:r.action,blocked:r.needBlocked})),
  buildings:s.projects.filter(p=>!p.natural).map(p=>({key:p.key,progress:p.work/PROJECTS[p.key].work,pending:p.pendingMaterials,condition:p.condition,animalHealth:p.animalHealth})),
  operations:(s.operations||[]).filter(o=>!o.done).map(o=>({recipe:o.recipe,phase:o.phase,status:o.status,growthRemaining:o.growthRemaining})),
  finances:{income:f.income,expenses:f.expenses,categories:f.categories}};
 samples.push(structuredClone(row));
 if(day%10===0||day===days){
  const raw=save(s);assert(restore(raw),`Day ${day}: save must restore`);
  fs.writeFileSync(path.join(output,`day-${day}-save.json`),raw);
 }
 const elapsed=(performance.now()-started)/1000;
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'Fresh story village with natural terrain; ordinary player commands; no injected funds, resources or completed buildings; same 0.1-second steps scheduled at 1024x through LabRunner. Automated simulation, not browser play.',seed,daysRequested:days,daysCompleted:day,initialMoney,elapsedSeconds:elapsed,actualSpeed:s.time/elapsed,orders,samples,maxStarvation,issues},null,2));
 console.log(`Day ${day}/${days}: R$${s.money.toFixed(2)}, food ${(s.materials.food+s.materials.meals).toFixed(1)}, ${row.buildings.filter(p=>p.progress===1).length} completed buildings, ${Math.round(s.time/elapsed)}x actual`);
}
for(let day=1;day<=days;day++){
 manage(day-1);
 const target=day*GAME_DAY;
 while(s.time<target-.05)runner.advance(Math.min(.25,(target-s.time)/1024),Infinity,()=>0);
 sample(day);
}
for(const [id,seconds]of Object.entries(maxStarvation))if(seconds>GAME_DAY)issues.push(`${id} spent ${(seconds/GAME_DAY).toFixed(2)} consecutive days with hunger below 5`);
if(days>=3)assert(s.projects.some(p=>p.key==='shelter'&&p.work===PROJECTS.shelter.work),'paid opening construction completes');
assert(s.finances.categories.outsideWork>0,'outside workers earn real income');
if(days>=100){
 assert(new Set(samples.map(s=>s.season)).size>=2,'run crosses seasonal boundaries');
 assert(s.projects.some(p=>p.key==='garden'&&p.work===PROJECTS.garden.work),'paid expansion completes');
}
const reportPath=path.join(output,'report.json');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));report.issues=issues;report.verdict=issues.length?'failed':'passed';fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
assert.deepEqual(issues,[],'no persistent starvation');
console.log(`PASS ${days} days at 1024x scheduling with fixed steps, accounting checks and periodic save restoration`);
