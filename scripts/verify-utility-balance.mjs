import {buyServiceParts} from './upkeep-playtest.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const pkg=process.env.SOLAR_WASM_DIR?pathToFileURL(path.resolve(process.env.SOLAR_WASM_DIR)+'/'):new URL('../web/pkg/',import.meta.url);
const {default:init,Game}=await import(new URL('solar_friends.js',pkg));
const wasm=await readFile(new URL('solar_friends_bg.wasm',pkg)),wasm_sha256=createHash('sha256').update(wasm).digest('hex');
await init({module_or_path:wasm});
const output='artifacts/utility-balance';await mkdir(output,{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),line=(s,id)=>s.village.pipes.lines.find(p=>p.id===id);
const raw=await readFile(process.env.SOLAR_STORY_CHECKPOINT||'artifacts/story-optional/solar-complete.json','utf8');
const connected=new Game(),manual=new Game();assert(connected.restore(raw));assert(manual.restore(raw));
assert.equal(snap(connected).village.version,27);assert(snap(connected).village.progress.later_completed.every(Boolean),'Use the earned completed Story village');
function checkpoint(g){
  const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();
  assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));
  const water=JSON.parse(g.water_report());for(let i=0;i<4;i++)assert(Math.abs(water.opening[i]+water.received[i]-water.consumed[i]-water.present[i])<.001);
  const n=snap(g).village.power.network,a=n.account;assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-n.nodes.reduce((sum,n)=>sum+n.charge,0))<.001);
}
function until(g,test,label,days=16){
  let checked=-Infinity;
  for(let tick=0;tick<days*1920;tick++){if(tick%8===0){const s=snap(g);if(test(s))return;if(s.village.minutes-checked>=1440){checked=s.village.minutes;buyServiceParts(g,s);}}g.tick(.25);}
  writeFileSync(output+'/stalled.json',g.snapshot());throw new Error(label+'; see '+output+'/stalled.json');
}
function purchase(g,kit){
  const missing=snap(g).environment.economy.shortage.map((n,i)=>Math.min(n,kit[i]));
  if(missing.some(Boolean))assert.equal(g.order_supplies(JSON.stringify(missing)),'ok','The earned village funds the actual missing installation kit');
  writeFileSync(output+'/last-order.json',JSON.stringify({kit,missing,scene:snap(g)}));
}
const port=(g,building)=>snap(g).village.power.network.nodes.find(n=>n.owner.kind==='building'&&n.owner.id===building).id;
function cable(g,to){
  const sources=snap(g).village.power.network.nodes.filter(n=>['solar','hydro'].includes(n.kind));
  const options=sources.map(n=>({id:n.id,quote:JSON.parse(g.electrical_connection_quote(n.id,to))})).filter(p=>p.quote.allowed).sort((a,b)=>a.quote.plan.cells.length-b.quote.plan.cells.length);
  assert(options.length,'The operating equipment needs a reachable local source');const chosen=options[0];
  assert.equal(g.queue_electrical_connection(chosen.id,to),'ok');const id=snap(g).village.pipes.lines.at(-1).id;purchase(g,chosen.quote.parts);
  until(g,s=>line(s,id).phase==='active','Resident cable installation');checkpoint(g);return id;
}
const start=snap(connected),building=kind=>start.village.buildings.find(b=>b.kind===kind).id;
const routes=[['fresh',building('well'),building('kitchen')],['fresh',building('well'),building('home')],['greywater',building('kitchen'),building('wetland')],['sewage',building('eco_toilet'),building('biodigester')],['irrigation',building('wetland'),building('garden')]];
const installed=[];
const continuing=process.env.SOLAR_UTILITY_CONTINUE==='1',results=[];
let ready;
if(continuing){
  const prior=JSON.parse(await readFile(output+'/report.json','utf8'));
  assert.equal(prior.results.length,1,'Continue only after the completed manual comparison');
  if(prior.wasm_sha256)assert.equal(prior.wasm_sha256,wasm_sha256,'Continue the same game build');
  assert(connected.restore(await readFile(output+'/connected-before.json','utf8')));
  assert(manual.restore(await readFile(output+'/manual-before.json','utf8')));
  ready=snap(connected);assert.equal(snap(manual).village.minutes,ready.village.minutes);
  assert.equal(ready.village.simulation.seed,start.village.simulation.seed);
  const finished=new Game();assert(finished.restore(await readFile(output+'/manual-after.json','utf8')));checkpoint(finished);
  const before=snap(manual),after=snap(finished),site=s=>s.village.production.sites.find(p=>p.building===building('workshop'));
  assert.equal(after.village.minutes-before.village.minutes,24*1440);
  assert(after.village.production.accounting.outputs[7]>=before.village.production.accounting.outputs[7]+2);
  assert.equal(site(after).energy_used,site(before).energy_used);
  const result=prior.results[0];assert.equal(result.name,'manual');assert.equal(result.days,24);
  assert(result.lowestFood>0&&result.highestFood<=100&&result.residents.every(r=>r.leisure>.5));
  results.push(result);finished.free();
  for(const [kind,from,to]of routes){
    const p=ready.village.pipes.lines.find(p=>p.plan.kind===kind&&p.plan.from===from&&p.plan.to===to&&p.phase==='active');
    assert(p,'Continue only with all five actually installed liquid routes');installed.push({kind,id:p.id});
  }
  console.log('Continuing connected comparison from the earned paid installation; manual results and native accounts rechecked.');
}else{
  for(const [kind,from,to]of routes){
    const quote=JSON.parse(connected.water_connection_quote(kind,from,to));assert(quote.allowed,quote.reason);
    assert.equal(connected.queue_water_connection(kind,from,to),'ok');const id=snap(connected).village.pipes.lines.at(-1).id;purchase(connected,quote.parts);
    until(connected,s=>line(s,id).phase==='active','Resident '+kind+' installation');
    const pump=snap(connected).village.power.network.nodes.find(n=>n.owner.kind==='pump'&&n.owner.id===id).id;
    const electricity=cable(connected,pump);installed.push({kind,id,electricity});
    writeFileSync(output+'/installed-'+installed.length+'.json',connected.snapshot());
    console.log('Installed '+kind+' and its paid pump cable on day '+(1+Math.floor(snap(connected).village.minutes/1440)));
  }
  cable(connected,port(connected,building('workshop')));
  const site=snap(connected).village.production.sites.find(p=>p.building===building('workshop')).id;
  assert.equal(connected.set_workshop_powered(site,true),'ok');
  ready=snap(connected);until(manual,s=>s.village.minutes>=ready.village.minutes,'Align the manual comparison with the same real calendar',Math.ceil((ready.village.minutes-start.village.minutes)/1440)+1);
  assert.equal(snap(manual).village.minutes,ready.village.minutes);
  await writeFile(output+'/connected-before.json',connected.snapshot());await writeFile(output+'/manual-before.json',manual.snapshot());
}
const work=new Set(['build','building_work','haul','water','utility','restore','source','prepare','craft','cook','compost','garden','gather']);
const leisure=new Set(['idle','nature_walk','birdwatch','stretch','daydream','stargaze','socialize','rest']);
for(const [name,g]of (continuing?[['connected',connected]]:[['manual',manual],['connected',connected]])){
  const before=snap(g),counts=before.residents.map(()=>({awake:0,work:0,leisure:0}));
  assert.equal(g.set_production_target(7,before.village.economy.stock[7]+2),'ok');
  const outputBefore=before.village.production.accounting.outputs[7],energyBefore=before.village.production.sites.find(p=>p.building===building('workshop')).energy_used;
  let lowestFood=Infinity,highestFood=0,peakHunger=0;
  for(let tick=0;tick<24*1920;tick++){
    g.tick(.25);if(tick%20)continue;const s=snap(g),v=s.village;const food=v.food+v.meals;
    lowestFood=Math.min(lowestFood,food);highestFood=Math.max(highestFood,food);
    for(const r of s.residents){const c=counts[r.id];if(r.task!=='sleep'&&!r.trip)c.awake++;if(!r.trip&&work.has(r.task))c.work++;if(!r.trip&&leisure.has(r.task))c.leisure++;
      peakHunger=Math.max(peakHunger,r.hunger);assert(r.hunger<95&&r.energy>20,'The established village must retain food and rest');}
    if(tick%1920===0){buyServiceParts(g,s);checkpoint(g);}
  }
  checkpoint(g);const after=snap(g),used=after.village.production.sites.find(p=>p.building===building('workshop')).energy_used-energyBefore;
  await writeFile(output+'/'+name+'-after.json',g.snapshot());
  results.push({name,from_day:1+Math.floor(before.village.minutes/1440),days:24,fund:after.village.economy.money,lowestFood,highestFood,peakHunger,workshop_energy:used,residents:counts.map(c=>({work:c.work/c.awake,leisure:c.leisure/c.awake})),flow:installed.map(p=>({kind:p.kind,water:line(after,p.id)?.transferred||0}))});
  await writeFile(output+'/report.json',JSON.stringify({wasm_sha256,continuedFromEarnedInstallation:continuing,installation_days:(ready.village.minutes-start.village.minutes)/1440,installation_spending:start.village.economy.money-ready.village.economy.money,results},null,2));
  console.log(name+': '+JSON.stringify(results.at(-1)));
  assert(after.village.production.accounting.outputs[7]>=outputBefore+2,'Both hand and powered tools finish the requested useful output');
  assert(name==='connected'?used>0:used===0,'Only the attended powered workshop spends operating energy');
  assert(lowestFood>0&&highestFood<=100,`Keep a useful food reserve without automatic hoarding: ${name} held ${lowestFood}–${highestFood}`);
  for(const c of counts)assert(c.leisure/c.awake>.5,'The successful village must leave each resident most waking time for themselves');
  if(name==='connected')for(const p of installed)assert(line(after,p.id).transferred>0,p.kind+' must actually operate through its local powered route');
}
await writeFile(output+'/report.json',JSON.stringify({wasm_sha256,continuedFromEarnedInstallation:continuing,installation_days:(ready.village.minutes-start.village.minutes)/1440,installation_spending:start.village.economy.money-ready.village.economy.money,results},null,2));
connected.free();manual.free();console.log('PASS: earned paid utility installation and a 24-day manual/connected comparison preserve all material, energy and liquid accounts, exact saves, useful production, healthy reserves and resident leisure.');
