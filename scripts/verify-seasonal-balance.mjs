import {buyServiceParts} from './upkeep-playtest.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const output=process.env.SOLAR_SEASONAL_OUTPUT||'artifacts/seasonal-balance';await mkdir(output,{recursive:true});
const game=new Game(),snap=()=>JSON.parse(game.snapshot());
assert(game.restore(await readFile(process.env.SOLAR_STORY_CHECKPOINT||'artifacts/story/solar-complete.json','utf8')));
const before=snap(),start=before.village.minutes;
assert.equal(before.village.mode,'story');assert.equal(before.village.climate.enabled,true,'Run the fresh seasonal Story first');
assert(before.village.progress.later_completed.every(Boolean),'Use earned campaign progress');
const days=84,people=before.residents.map(()=>({awake:0,work:0,leisure:0}));
await writeFile(output+'/report.json',JSON.stringify({passed:false,stage:'running',days,from_day:1+Math.floor(start/1440)},null,2));
const work=new Set(['build','building_work','haul','water','utility','restore','source','prepare','craft','cook','compost','garden','gather']);
const leisure=new Set(['idle','nature_walk','birdwatch','stretch','daydream','stargaze','socialize','rest']);
let minFood=Infinity,maxFood=0,minBasicFood=Infinity,maxBasicFood=0,maxHunger=0,minEnergy=100,rainSamples=0,checks=0,serviceOrders=0,serviceSpending=0;const seasons=new Set();let lowBasicRecorded=false;
function fail(message){writeFileSync(output+'/stalled.json',game.snapshot());throw Error(message+'; see '+output+'/stalled.json');}
function check(){
  const saved=game.snapshot(),copy=new Game();if(!copy.restore(saved))fail('A seasonal checkpoint must reload');assert.equal(copy.snapshot(),saved);copy.free();
  assert(JSON.parse(game.simulation_report()).materials.every(m=>m.difference===0));
  const w=JSON.parse(game.water_report());for(let i=0;i<4;i++)assert(Math.abs(w.opening[i]+w.received[i]-w.consumed[i]-w.present[i])<.001);
  const n=snap().village.power.network,a=n.account;assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-n.nodes.reduce((sum,p)=>sum+p.charge,0))<.001);
  const report=game.weather_report();assert.equal(game.weather_report(),report);assert.equal(game.snapshot(),saved);checks++;
}
for(let tick=0;tick<days*1920;tick++){
  game.tick(.25);if(tick%20)continue;const s=snap(),v=s.village,basic=v.food+v.meals;
  // These are the four foods residents can eat directly (food::meal/eat).
  // Eggs need cooking; committed pot inputs are not ready portions.
  const food=basic+s.environment.economy.materials[25].stored+s.environment.economy.materials[26].stored;
  minBasicFood=Math.min(minBasicFood,basic);maxBasicFood=Math.max(maxBasicFood,basic);
  if(basic<=0&&!lowBasicRecorded){
    lowBasicRecorded=true;writeFileSync(output+'/first-low-basic.json',game.snapshot());
    const details={minutes:v.minutes,ingredients:v.food,meals:v.meals,milk:s.environment.economy.materials[25].stored,honey:s.environment.economy.materials[26].stored,hunger:s.residents.map(r=>r.hunger)};
    writeFileSync(output+'/first-low-basic-report.json',JSON.stringify(details,null,2));
    if(process.env.SOLAR_SEASONAL_PROBE==='1'){console.log('Diagnostic checkpoint: '+JSON.stringify(details));game.free();process.exit(0);}
  }
  minFood=Math.min(minFood,food);maxFood=Math.max(maxFood,food);seasons.add(s.environment.weather.forecast[0].season);rainSamples+=Number(s.environment.raining);
  for(const r of s.residents){const c=people[r.id];if(r.task!=='sleep'&&!r.trip)c.awake++;if(!r.trip&&work.has(r.task))c.work++;if(!r.trip&&leisure.has(r.task))c.leisure++;maxHunger=Math.max(maxHunger,r.hunger);minEnergy=Math.min(minEnergy,r.energy);if(r.hunger>=95||r.energy<=20)fail('Seasonal operation must retain food and rest');}
  // A careful player follows through on new care agreements using real requests.
  const care=v.situations.active;
  if(care&&care.resolved==null){
    if(care.response==null)assert.equal(game.respond_situation('share_shifts'),'ok');
    const helper=s.residents.find(r=>r.id!==care.resident&&!(care.helpers&(1<<r.id))&&!r.trip);
    if(helper&&(!helper.help||helper.help.finished!=null))game.request(helper.id,'cook',false);
  }
  if(tick%1920===0){
    const order=buyServiceParts(game,s);
    if(order){serviceOrders++;serviceSpending+=order.paid;}
    check();
  }
}
check();const after=snap(),report={passed:false,days,from_day:1+Math.floor(start/1440),to_day:1+Math.floor(after.village.minutes/1440),seasons:[...seasons],rainSamples,foodMeasure:"Ready ingredients, meals, milk and honey; eggs require cooking",minFood,maxFood,minBasicFood,maxBasicFood,maxHunger,minEnergy,exact_checkpoints:checks,serviceOrders,serviceSpending,completedServices:after.village.maintenance.jobs.filter(j=>j.finished!=null&&j.finished>=start&&!j.cancelled).length,pendingServices:after.village.maintenance.jobs.filter(j=>j.finished==null).length,residents:people.map(c=>({work:c.work/c.awake,leisure:c.leisure/c.awake}))};
await writeFile(output+'/after.json',game.snapshot());await writeFile(output+'/report.json',JSON.stringify(report,null,2));
if(minFood<=0||maxFood>100)fail(`Keep a useful food reserve through wet and dry periods: ${minFood}–${maxFood}`);
if(seasons.size!==2||!rainSamples)fail('The replay must actually include wet/dry periods and real rain');
if(people.some(c=>c.leisure/c.awake<=.5))fail('Each resident needs majority waking leisure across seasonal cycles');
assert(serviceOrders>0&&report.completedServices>0,'Seasonal operation must include paid parts and completed resident maintenance');
report.passed=true;await writeFile(output+'/report.json',JSON.stringify(report,null,2));game.free();
console.log(`PASS: ${days} earned Story days across two seasonal cycles, ${checks} exact checkpoints, ${report.completedServices} actual service jobs with paid parts, balanced material/water/energy accounts, food ${minFood}–${maxFood}, peak hunger ${maxHunger.toFixed(1)}, leisure ${Math.floor(Math.min(...report.residents.map(r=>r.leisure))*100)}%+ per resident.`);
