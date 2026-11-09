import fs from'node:fs';import assert from'node:assert/strict';
import{restore,tick,save,PROJECTS,plan,enableFastNavigation}from'../web/v02/weekend/simulation.js';
import{economyPolicies}from'../web/v02/weekend/economy-policies.js';
const s=restore(fs.readFileSync('docs/playtests/evidence/2026-11-08-regular-catalog-day61-save.json','utf8'));assert(s);enableFastNavigation(s);
const policies=economyPolicies(s);policies.sales.bamboo={enabled:true,keep:24,above:48,daily:96};policies.sales.food={enabled:true,keep:24,above:60,daily:96};
for(const p of s.projects)if(p.repeat)p.stockTarget=p.repeat==='bamboo'?96:120;
// Paid expansion, ordinary resident construction, no added stock or funds.
const placement=plan(s,'home-shared',60,0);assert.equal(placement,'');const project=s.projects.at(-1),start=s.time,opening=s.money,samples=[];
for(let i=0;i<96000;i++){tick(s,.1);if(i%1333===0)samples.push({time:s.time,money:s.money,food:s.materials.food,water:Object.values(s.infrastructure.nodes).reduce((n,a)=>n+a.water[0],0),needs:Math.min(...s.people.flatMap(r=>Object.values(r.needs))),work:project.work,bamboo:s.materials.bamboo});}
assert(project.work>=PROJECTS[project.key].work,'construction completes alongside automated production');assert(s.money>opening,'surplus sales earn income without manual clicks');assert(samples.every(p=>p.money>=0&&p.food>0&&p.water>0),'food, water and cash survive the three-day expansion');assert(restore(save(s)),'policies and end state restore');
fs.writeFileSync('docs/balance/2026-11-08-economy-soak.json',JSON.stringify({kind:'Automated replay of the genuine Day 61 save, not browser play',seed:s.landSeed,seconds:s.time-start,openingAfterBlueprint:opening,endingMoney:s.money,constructionComplete:true,samples},null,2)+'\n');
console.log('PASS three game days: paid house completed, automatic exports earned income, food/water/cash remained available, end save restores');
