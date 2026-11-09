import fs from 'node:fs';
import {PROJECTS,MATERIALS,PROCESSES} from '../web/v02/weekend/simulation.js';
const buy=id=>(MATERIALS[id]?.price||0)/(MATERIALS[id]?.quantity||1),sell=id=>Math.floor((MATERIALS[id]?.price||0)*.5)/(MATERIALS[id]?.quantity||1);
const before=JSON.parse(fs.readFileSync('docs/balance/2026-11-08-recipes-before.json','utf8'));
const ids=['bamboo','vegetables','greenhouse','fruit','bananas','honey','eggs','milk'];
const rows=[];
for(const phase of ['before','after'])for(const id of ids){const r=(phase==='before'?before:PROCESSES)[id],build=Object.values(PROJECTS).find(p=>p.kind===r.kind),revenue=Object.entries(r.output).reduce((n,[id,v])=>n+v*sell(id),0),inputs=Object.entries(r.input).reduce((n,[id,v])=>n+v*buy(id),0),profit=revenue-inputs,investment=Object.entries(build.materials).reduce((n,[id,v])=>n+v*buy(id),0);rows.push({phase,recipe:id,investment,land:build.size[0]*build.size[1],work:r.work,regrowth:r.renew||0,water:r.water||0,inputs,revenue,net:profit,netPerWorkMinute:profit/r.work*60,maxNetPerGameDay:profit/(r.work+(r.renew||0))*3200,paybackDays:investment/profit*(r.work+(r.renew||0))/3200});}
for(const phase of ['before','after']){
 const investment=['supply-0','supply-5'].reduce((n,key)=>n+Object.entries(PROJECTS[key].materials).reduce((v,[id,q])=>v+q*buy(id),0),0),net=12*sell('planks')+2*sell('wood'),work=60+2*45+2*35,regrowth=600;
 rows.push({phase,recipe:'timber_to_planks',investment,land:10,work,regrowth,water:0,inputs:0,revenue:net,net,netPerWorkMinute:net/work*60,maxNetPerGameDay:net/(work+regrowth)*3200,paybackDays:investment/net*(work+regrowth)/3200});
}
fs.writeFileSync('docs/balance/2026-11-08-income-chains.json',JSON.stringify({method:'Nominal recipe estimates: bought inputs at unit retail prices, output at unit sale prices. Excludes travel, needs, batch rounding, water infrastructure and electricity. Not measured throughput.',rows},null,2)+'\n');
console.table(rows.filter(r=>r.phase==='after').map(r=>({chain:r.recipe,net:r.net,work:r.work,growth:r.regrowth,maxDaily:r.maxNetPerGameDay.toFixed(1),payback:r.paybackDays.toFixed(1)})));
