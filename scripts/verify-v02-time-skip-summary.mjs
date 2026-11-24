import assert from 'node:assert/strict';
import {createWeekend,createSandbox,chooseCamp,save,enableFastNavigation,PROJECTS,MATERIALS} from '../web/v02/weekend/simulation.js';
import {PROCESSES} from '../web/v02/weekend/catalog-rules.js';
import {DAY} from '../web/v02/weekend/weather.js';
import {foodPortions} from '../web/v02/weekend/food-storage.js';
import {skipDays} from '../web/v02/weekend/time-skip.js';
import {snapshotVillage,summarizeSkip} from '../web/v02/weekend/time-skip-summary.js';

const options={projects:PROJECTS,materials:MATERIALS,recipes:PROCESSES};
const fresh=()=>{const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);return s;};
const cents=text=>Math.round(Number(text.replace('−','-').replace(/[^0-9.+-]/g,''))*100);
const find=(summary,id)=>summary.sections.find(section=>section.id===id);
const water=s=>Object.values(s.infrastructure?.nodes||{}).reduce((n,node)=>n+(node.water?.[0]||0),0);

// Nothing happened: no sections, and reading the village changes nothing.
const idle=fresh(),untouched=save(idle),idleBefore=snapshotVillage(idle);
const nothing=summarizeSkip(idleBefore,idle,options);
assert.equal(save(idle),untouched,'snapshot and summary are read-only');
assert.equal(nothing.quiet,true);assert.deepEqual(nothing.sections,[]);assert.equal(nothing.title,'No time passed');

// Five idle days on a fresh Story village: every figure is a real before/after difference.
const s=fresh(),before=snapshotVillage(s),frozen=structuredClone(before),start={money:s.money,portions:foodPortions(s),water:water(s)};
const result=await skipDays(s,5,{fast:true,yieldControl:async()=>{}});
const saved=save(s),summary=summarizeSkip(before,s,{...options,requestedDays:5,completed:result.completed});
assert.equal(save(s),saved,'summary leaves the advanced village untouched');
assert.deepEqual(before,frozen,'summary leaves the snapshot untouched');
assert.equal(summary.days,5);assert.equal(summary.title,'5 days later');assert.equal(summary.stopped,'');
assert.equal(summary.from,'Day 1 · 09:00');assert.equal(summary.to,'Day 6 · 09:00');
assert.match(summary.weather,/^(No rain|Rain every day|Rain on [1-4] of 5 days)$/);
const money=find(summary,'money');
assert(money,'idle days still cost money');assert.equal(money.screen,'finances');
assert.equal(money.total,`R$${start.money.toFixed(2)} → R$${s.money.toFixed(2)}`);
assert.equal(money.rows.reduce((n,row)=>n+cents(row.value),0),Math.round((s.money-start.money)*100),'category rows add up to the savings change');
assert.equal(cents(money.note),Math.round((s.money-start.money)*100));
for(const [key,label] of [['household','Food bought'],['transport','Trips to town and deliveries']])
  assert.equal(cents(money.rows.find(row=>row.label===label).value),Math.round(s.finances.categories[key]*100),`${key} matches the Finances ledger`);
assert(money.rows.every(row=>row.tone===(cents(row.value)>0?'gain':'loss')));
const stores=find(summary,'stores');
assert.equal(stores.rows.find(row=>row.label==='Food portions').value,`${start.portions} → ${foodPortions(s)}`);
assert.equal(stores.rows.find(row=>row.label==='Drinking water').value,`${Math.round(start.water)} → ${Math.round(water(s))} L`);
const notes=find(summary,'notes'),runs=notes.rows.find(row=>row.label==='Emergency food runs');
assert.equal(runs.value,`${s.events.filter(e=>e.text.includes('emergency ingredients')).length} trips`);assert.equal(runs.screen,'resources');
assert(!notes.rows.some(row=>/purified|heading to the car|unloaded/.test(row.value)),'routine log lines are folded into counts');
assert(!find(summary,'building')&&!find(summary,'farm'),'sections with nothing to report are left out');
assert.equal(summary.quiet,false);

// Stopped early: only the part that ran is reported.
const partial=fresh(),partialBefore=snapshotVillage(partial);let steps=0;
const stopped=await skipDays(partial,4,{fast:true,yieldControl:async()=>{},now:(()=>{let n=0;return()=>n+=13;})(),progress:()=>steps++,cancelled:()=>steps>DAY*1.5});
const early=summarizeSkip(partialBefore,partial,{...options,requestedDays:4,completed:stopped.completed});
assert.equal(stopped.completed,false);assert(Math.abs(early.days-1.5)<.01);
assert.equal(early.title,'1.5 days later');assert.equal(early.stopped,'Stopped early: 1.5 days of the 4 days you asked for.');

// Building, crops, animals, spoilage and crafting are read from their own records.
const v=fresh();
v.projects.push({id:900,key:'gathering',x:0,z:0,work:PROJECTS.gathering.work*.25,delivered:1},{id:901,key:'shelter',x:0,z:0,work:0,delivered:0},{id:902,key:'water',x:0,z:0,work:1,removal:{mode:'salvage'}},
  {id:903,key:'garden',x:0,z:0,work:PROJECTS.garden?.work||1,cultivation:{beds:[
    {id:0,crop:'greens',stage:'harvestable',ripeAt:v.time,exportedKg:2},{id:1,crop:'beans',stage:'growing',exportedKg:0},{id:2,crop:'corn',stage:'growing',exportedKg:0}]}},
  {id:904,key:'coop',x:0,z:0,work:PROJECTS.coop?.work||1,animalCare:{version:1,feed:1,water:1,pending:0,lots:[],produced:3,spoiled:1,collected:2}});
const vBefore=snapshotVillage(v);
v.time+=2*DAY;
v.projects.find(p=>p.id===900).work=PROJECTS.gathering.work;
v.projects.find(p=>p.id===901).work=PROJECTS.shelter.work*.5;
v.projects=v.projects.filter(p=>p.id!==902);
const beds=v.projects.find(p=>p.id===903).cultivation.beds;
Object.assign(beds[0],{stage:'harvested',exportedKg:6.5});delete beds[0].ripeAt;
Object.assign(beds[1],{stage:'harvestable',ripeAt:v.time});beds[2].stage='failed';
Object.assign(v.projects.find(p=>p.id===904).animalCare,{produced:12,collected:8,spoiled:3});
v.foodStorage={version:1,lots:{},spoiled:{meals:4}};
v.productionAccounting={version:1,since:0,batches:{meals:2}};
v.wood-=5;v.people.pop();
const built=summarizeSkip(vBefore,v,options);
const rows=id=>find(built,id).rows,row=(id,label)=>rows(id).find(r=>r.label===label);
assert.deepEqual(rows('building').map(r=>[r.label,r.value]),[[PROJECTS.gathering.name,'Finished'],[PROJECTS.shelter.name,'0% → 50%'],[PROJECTS.water.name,'Removed']]);
assert.equal(rows('building')[0].site,900);
assert.equal(row('farm',`${MATERIALS.greens.name} harvested`).value,'4.5 kg');
assert.equal(row('farm',`${MATERIALS.beans.name} ready to harvest`).value,'1 bed');
assert.equal(row('farm',`${MATERIALS.corn.name} lost in the field`).tone,'loss');
assert.equal(row('farm',`${PROJECTS.coop.name}: collected`).value,'6');
assert.equal(row('farm',`${PROJECTS.coop.name}: spoiled before collection`).value,'2');
assert.equal(row('farm',PROCESSES.meals.name).value,'2 batches');
assert.match(row('stores','Food spoiled in storage').value,/^4 /);
assert.equal(row('supplies',MATERIALS.wood.name).tone,'loss');
assert.equal(find(built,'residents').rows[0].value,'1 resident');
assert(!find(built,'money'),'no money section when savings did not move');

// The caller's money format is used, and sandbox funds are not reported.
const paid=fresh(),paidBefore=snapshotVillage(paid);
paid.money-=12.5;paid.finances={categories:{electricity:-12.5}};
assert.equal(find(summarizeSkip(paidBefore,paid,{...options,money:n=>`${n.toFixed(2).replace('.',',')} reais`}),'money').rows[0].value,'−12,50 reais');
const sandbox=createSandbox(42),sandboxBefore=snapshotVillage(sandbox);sandbox.time+=DAY;
const free=summarizeSkip(sandboxBefore,sandbox,options);
assert(!find(free,'money')&&!find(free,'supplies'));assert.equal(free.title,'1 day later');
console.log('PASS advance-days summary: real savings, food, water, building, harvest and log differences; quiet, stopped-early and sandbox states; read-only.');
