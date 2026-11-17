import fs from 'node:fs';
import assert from 'node:assert/strict';
import {restore,save,tick,enableFastNavigation,PROJECTS,queueProduction,supplyRun,sellMaterial,MATERIALS} from '../web/v02/weekend/simulation.js';
import {setOutsideWork} from '../web/v02/weekend/outside-work.js';
import {GAME_DAY} from '../web/v02/weekend/biological-production.js';
const strategy=process.argv[2]||'timber',source='docs/balance/evidence/2026-11-17-income-start-save.json',resume=process.argv.includes('--resume'),path=`/tmp/solar-income-${strategy}.json`,prior=resume?JSON.parse(fs.readFileSync(path,'utf8')):null,s=restore(fs.readFileSync(resume?path.replace('.json','-save.json'):source,'utf8'));assert(s);enableFastNavigation(s);
for(const r of s.people)setOutsideWork(s,r,r.id==='bento'||(strategy==='vegetables'&&r.id==='iara'));
const recipe={timber:'saw_timber',eggs:'eggs',vegetables:'vegetables'}[strategy],kind={timber:'supply-5',eggs:'coop',vegetables:'garden'}[strategy],resource={timber:'wood',eggs:'eggs',vegetables:'food'}[strategy];
const site=s.projects.find(p=>PROJECTS[p.key].kind===kind&&p.work>=PROJECTS[p.key].work);assert(site);
const start=prior?s.time-prior.elapsedDays*GAME_DAY:s.time,opening=prior?.opening??s.money,before=Object.fromEntries(Object.entries(s.finances.categories).map(([id,n])=>[id,n-(prior?.changes[id]||0)])),trees=new Set(prior?.selectedTrees||[]);let lastAction=-1;
function report(){const changes=Object.fromEntries(Object.entries(s.finances.categories).map(([id,n])=>[id,+(n-(before[id]||0)).toFixed(2)]));const out={kind:'Normal-command continuation from an actual paid catalog run; no injected supplies, money or completed buildings',strategy,source,stock:s.materials[resource],health:site.animalHealth,care:s.upkeep?.jobs.filter(j=>j.target===site.id),water:s.infrastructure.nodes[site.id]?.water,opening,closing:s.money,elapsedDays:(s.time-start)/GAME_DAY,changes,selectedTrees:[...trees],retainedCompletedOperations:s.operations.filter(o=>o.done&&o.recipe===recipe).length,sales:s.trade?.orders.filter(o=>o.material===resource&&o.status==='sold').length||0,restores:!!restore(save(s)),limitations:'Inherited capital built under recorded prior price revisions; one outside job (two for the long vegetable cycle) supports household food. Sales are not standalone whole-village profitability.'};fs.writeFileSync(path,JSON.stringify(out,null,2));fs.writeFileSync(path.replace('.json','-save.json'),save(s));console.log(JSON.stringify(out));return out;}
for(let i=0;i<100*GAME_DAY*10;i++){
 if(s.time-lastAction>=100){lastAction=s.time;
  if(strategy==='timber'&&trees.size<2&&!s.operations.some(o=>!o.done&&o.recipe==='fell_tree')){
   const tree=s.projects.filter(p=>PROJECTS[p.key].kind==='wild-tree'&&!p.felled&&!trees.has(p.id)).sort((a,b)=>Math.hypot(a.x-s.stock.x,a.z-s.stock.z)-Math.hypot(b.x-s.stock.x,b.z-s.stock.z))[0];
   if(tree&&!queueProduction(s,tree.id,'fell_tree'))trees.add(tree.id);
  }
  if(strategy==='eggs'&&s.materials.fodder<3)supplyRun(s,'fodder');
  if(strategy==='vegetables'&&s.materials.seedlings<2&&!s.operations.some(o=>!o.done&&o.recipe===recipe))supplyRun(s,'seedlings');
  if(!s.operations.some(o=>!o.done&&o.site===site.id&&!o.water))queueProduction(s,site.id,recipe);
  const stock=resource==='wood'?s.wood:s.materials[resource],reserve=resource==='food'?15:0;
  if(stock>=MATERIALS[resource].quantity+reserve&&s.operations.some(o=>o.done&&o.recipe===recipe))sellMaterial(s,resource);
 }
 tick(s,.1);
 if(i%32000===0){const r=report();if(r.sales>0&&r.retainedCompletedOperations>0){console.log('PASS resident production reached an actual paid town sale');break;}}
}
const result=report();assert(result.sales>0&&result.retainedCompletedOperations>0&&result.restores);
