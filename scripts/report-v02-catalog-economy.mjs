import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sourceFiles=fs.readdirSync('web/v02/weekend').filter(f=>f.endsWith('.js')).sort();
const sourceHash=createHash('sha256').update(sourceFiles.map(f=>fs.readFileSync(`web/v02/weekend/${f}`)).join('\n')).digest('hex');
import {createWeekend,chooseCamp,enableFastNavigation,plan,placementError,tick,PROJECTS,save,restore,blueprintPurchase,supplyRun,queueProduction,sellMaterial} from '../web/v02/weekend/simulation.js';
import {setOutsideWork} from '../web/v02/weekend/outside-work.js';
import {GAME_DAY} from '../web/v02/weekend/biological-production.js';
const resume=process.argv.includes('--resume'),outputPath=process.argv.find(a=>a.endsWith('.json'))||'/tmp/solar-catalog-economy.json';
const s=resume?restore(fs.readFileSync(outputPath.replace('.json','-save.json'),'utf8')):createWeekend(42);if(!s)throw Error('Checkpoint failed to restore');if(!resume)chooseCamp(s,'entrance');enableFastNavigation(s);
s.deliveryOnly=true; // Player-selectable bulk supplier delivery for large shell orders.
s.expansionReserve=100; // The same planning-reserve control available in Finances.
for(const r of s.people.slice(0,4))setOutsideWork(s,r,true);
const keys=[...new Set(['gathering','water','toilet','shelter','covered-stores','warehouse',...Object.keys(PROJECTS).filter(k=>!PROJECTS[k].natural)])],events=resume?JSON.parse(fs.readFileSync(outputPath,'utf8')).events:[];
const path=outputPath;
const prior=resume?JSON.parse(fs.readFileSync(path,'utf8')):null;
const revisions=[...(prior?.revisions||[]),{resumed:resume,day:1+s.time/GAME_DAY,sourceHash,sourceFiles}];
let nextAction=s.time,nextReport=s.time+GAME_DAY/4;
const candidates=[];for(let radius=3;radius<65;radius+=2)for(let z=Math.max(-30,s.stock.z-radius);z<Math.min(94,s.stock.z+radius);z++)for(let x=Math.max(-30,s.stock.x-radius);x<Math.min(94,s.stock.x+radius);x++)if(Math.max(Math.abs(x-s.stock.x),Math.abs(z-s.stock.z))>=radius-2)candidates.push({x,z});
function report(){const out={revisions,kind:'Fresh default story village, normal commands and resident labor; automated not browser play',strategy:'Four optional outside jobs; paid purchases and resident construction; after Day 139 finite selected trees feed sawmill and surplus exports, retaining 64 timber pieces; bulk supplier delivery from approximately Day 147; local earth/stone targets and fifth outside job while saving from approximately Day 220; ordinary pickups for small purchases after bulky deliveries finish from approximately Day 237; purchased raw wood feeds the sawmill after finite trees are depleted from approximately Day 270',seed:42,day:1+s.time/GAME_DAY,money:s.money,food:s.materials.food,meals:s.materials.meals,completed:keys.filter(k=>s.projects.some(p=>p.key===k&&p.work>=PROJECTS[k].work)),pending:s.projects.filter(p=>!p.natural&&p.work<PROJECTS[p.key].work).map(p=>({key:p.key,work:p.work,required:PROJECTS[p.key].work,pending:p.pendingMaterials})),events,restores:!!restore(save(s))};fs.writeFileSync(path,JSON.stringify(out,null,2));fs.writeFileSync(path.replace('.json','-save.json'),save(s));console.log(JSON.stringify({day:out.day,money:out.money,completed:out.completed.length,pending:out.pending.map(p=>p.key),restores:out.restores}));return out;}
for(let i=0;i<720*GAME_DAY*10;i++){
 tick(s,.1);
 if(s.time>=nextAction){nextAction=s.time+100;
  s.deliveryOnly=s.projects.some(p=>p.pendingMaterials);
  // When saving for the next project, all five friends may take optional paid
  // work. Keep one local builder while a construction job is active.
  const building=s.projects.some(p=>!p.natural&&p.work<PROJECTS[p.key].work);
  setOutsideWork(s,s.people[4],!building);
  for(const [recipe,kind,target] of [['earth','supply-2',400],['stone','supply-3',200]]){
   const deposits=s.projects.filter(p=>PROJECTS[p.key].kind===kind&&!p.productionStatus?.includes('exhausted')).sort((a,b)=>Math.hypot(a.x-s.stock.x,a.z-s.stock.z)-Math.hypot(b.x-s.stock.x,b.z-s.stock.z));
   if(deposits[0]&&(s.materials[recipe]||0)<target&&!s.operations?.some(o=>!o.done&&o.site===deposits[0].id))queueProduction(s,deposits[0].id,recipe);
  }
  // Work the finite woodland through the same selectable-tree and sawmill
  // commands a player uses; retain construction timber before selling surplus.
  const saw=s.projects.find(p=>PROJECTS[p.key].kind==='supply-5'&&p.work>=PROJECTS[p.key].work);
  if(saw){
   if(s.wood<100&&!s.operations?.some(o=>!o.done&&o.site===saw.id))queueProduction(s,saw.id,'saw_timber');
   if(s.materials.logs<24&&!s.operations?.some(o=>o.recipe==='fell_tree'&&!o.done)){
    const tree=s.projects.filter(p=>PROJECTS[p.key].kind==='wild-tree'&&!p.felled).sort((a,b)=>Math.hypot(a.x-s.stock.x,a.z-s.stock.z)-Math.hypot(b.x-s.stock.x,b.z-s.stock.z))[0];
    if(tree)queueProduction(s,tree.id,'fell_tree');
    else if(s.money>300&&s.materials.logs<12)supplyRun(s,'logs');
   }
   if(s.wood>=76)sellMaterial(s,'wood');
  }
  if(s.upkeep?.jobs.some(j=>!j.done&&!j.care&&!j.soil)&&s.money>250){if(s.materials.tools<1)supplyRun(s,'tools');else if(s.materials.hardware<1)supplyRun(s,'hardware');}
  if(s.materials.fodder<12&&s.projects.some(p=>['coop','goat_pasture'].includes(PROJECTS[p.key].kind)))supplyRun(s,'fodder');
  if(s.projects.filter(p=>!p.natural&&p.work<PROJECTS[p.key].work).length<2){
   for(const key of keys.filter(k=>!s.projects.some(p=>p.key===k))){
    s.deliveryOnly=true; // Quote bulky construction with supplier freight.
    if(blueprintPurchase(s,key).error)continue;
    console.log(`Finding site for ${key} at ${s.time.toFixed(1)}`);
    const spot=candidates.find(p=>!placementError(s,key,p.x,p.z));console.log(`Site search finished: ${key}, ${!!spot}`);if(!spot)continue;
    const error=plan(s,key,spot.x,spot.z);events.push({time:s.time,key,...spot,error});if(!error)break;
   }
  }
  s.deliveryOnly=s.projects.some(p=>p.pendingMaterials);
 }
 if(s.time>=nextReport){nextReport+=GAME_DAY/4;const out=report();if(out.completed.length===keys.length){console.log('PASS all buildable types constructed through paid supplies and resident work');break;}}
}
const final=report();assert.equal(final.completed.length,keys.length,'every catalog building must finish');assert(final.restores);
