import fs from 'node:fs';
import {createWeekend,chooseCamp,enableFastNavigation,plan,placementError,tick,PROJECTS,save,restore,blueprintPurchase,supplyRun} from '../web/v02/weekend/simulation.js';
import {setOutsideWork} from '../web/v02/weekend/outside-work.js';
import {GAME_DAY} from '../web/v02/weekend/biological-production.js';
const resume=process.argv.includes('--resume'),outputPath=process.argv.find(a=>a.endsWith('.json'))||'/tmp/solar-catalog-economy.json';
const s=resume?restore(fs.readFileSync(outputPath.replace('.json','-save.json'),'utf8')):createWeekend(42);if(!s)throw Error('Checkpoint failed to restore');if(!resume)chooseCamp(s,'entrance');enableFastNavigation(s);
s.expansionReserve=100; // The same planning-reserve control available in Finances.
for(const r of s.people.slice(0,4))setOutsideWork(s,r,true);
const keys=[...new Set(['gathering','water','toilet','shelter','covered-stores','warehouse',...Object.keys(PROJECTS).filter(k=>!PROJECTS[k].natural)])],events=resume?JSON.parse(fs.readFileSync(outputPath,'utf8')).events:[];
const path=outputPath;
let nextAction=s.time,nextReport=s.time+GAME_DAY/4;
const candidates=[];for(let radius=3;radius<65;radius+=2)for(let z=Math.max(-30,s.stock.z-radius);z<Math.min(94,s.stock.z+radius);z++)for(let x=Math.max(-30,s.stock.x-radius);x<Math.min(94,s.stock.x+radius);x++)if(Math.max(Math.abs(x-s.stock.x),Math.abs(z-s.stock.z))>=radius-2)candidates.push({x,z});
function report(){const out={kind:'Fresh default story village, normal commands and resident labor; automated not browser play',seed:42,day:1+s.time/GAME_DAY,money:s.money,food:s.materials.food,meals:s.materials.meals,completed:keys.filter(k=>s.projects.some(p=>p.key===k&&p.work>=PROJECTS[k].work)),pending:s.projects.filter(p=>!p.natural&&p.work<PROJECTS[p.key].work).map(p=>({key:p.key,work:p.work,required:PROJECTS[p.key].work,pending:p.pendingMaterials})),events,restores:!!restore(save(s))};fs.writeFileSync(path,JSON.stringify(out,null,2));fs.writeFileSync(path.replace('.json','-save.json'),save(s));console.log(JSON.stringify({day:out.day,money:out.money,completed:out.completed.length,pending:out.pending.map(p=>p.key),restores:out.restores}));return out;}
for(let i=0;i<240*GAME_DAY*10;i++){
 tick(s,.1);
 if(s.time>=nextAction){nextAction=s.time+100;
  if(s.materials.fodder<12&&s.projects.some(p=>['coop','goat_pasture'].includes(PROJECTS[p.key].kind)))supplyRun(s,'fodder');
  if(s.projects.filter(p=>!p.natural&&p.work<PROJECTS[p.key].work).length<2){
   for(const key of keys.filter(k=>!s.projects.some(p=>p.key===k))){
    if(blueprintPurchase(s,key).error)continue;
    console.log(`Finding site for ${key} at ${s.time.toFixed(1)}`);
    const spot=candidates.find(p=>!placementError(s,key,p.x,p.z));console.log(`Site search finished: ${key}, ${!!spot}`);if(!spot)continue;
    const error=plan(s,key,spot.x,spot.z);events.push({time:s.time,key,...spot,error});if(!error)break;
   }
  }
 }
 if(s.time>=nextReport){nextReport+=GAME_DAY/4;const out=report();if(out.completed.length===keys.length){console.log('PASS all buildable types constructed through paid supplies and resident work');break;}}
}
report();
