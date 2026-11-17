import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ECONOMY_REFERENCE} from '../web/v02/weekend/economy-reference.js';
import {createWeekend,chooseCamp,enableFastNavigation,plan,placementError,tick,PROJECTS,MATERIALS,save,restore,blueprintPurchase,queueProduction,sellMaterial} from '../web/v02/weekend/simulation.js';
import {applySettings,DEFAULT_SETTINGS} from '../web/v02/weekend/world-settings.js';
import {setOutsideWork} from '../web/v02/weekend/outside-work.js';
const rows=[];
for(const biome of ['mata-atlantica','cerrado','caatinga'].filter(b=>!process.argv[3]||b===process.argv[3]))for(const savings of ['tight','modest','comfortable'])for(const town of ['nearby','remote']){
 const seed=42+['mata-atlantica','cerrado','caatinga'].indexOf(biome)*6+rows.length%6,s=createWeekend(seed);applySettings(s,{...DEFAULT_SETTINGS,biome,savings,town});chooseCamp(s,'entrance');enableFastNavigation(s);
 const opening=s.money,orders=[];
 const desired=['water','toilet','shelter','covered-stores','gathering'];
 // Two optional jobs support a tight start. Submit each affordable project in
 // order, then retry after earnings arrive; a rejected quote is not a purchase.
 setOutsideWork(s,s.people[0],true);setOutsideWork(s,s.people[1],true);
 const days=savings==='tight'?21:3;
 const selectedTrees=new Set();
 for(let i=0;i<days*32000;i++){
  if(i%1000===0)for(const key of desired.filter(k=>!s.projects.some(p=>p.key===k))){
   if(blueprintPurchase(s,key).error)break;
   let spot;for(let radius=3;radius<16&&!spot;radius++)for(let z=s.stock.z-radius;z<=s.stock.z+radius&&!spot;z++)for(let x=s.stock.x-radius;x<=s.stock.x+radius&&!spot;x++)if(!placementError(s,key,x,z))spot={x,z};
   const error=spot?plan(s,key,spot.x,spot.z):'No nearby placement';
   orders.push({key,day:1+s.time/3200,error});if(error)break;
  }
  if(savings==='tight'&&i%1000===0&&s.money<600){
   if(selectedTrees.size<6&&!s.operations?.some(o=>o.recipe==='fell_tree'&&!o.done)){
    const tree=s.projects.filter(p=>PROJECTS[p.key].kind==='wild-tree'&&!p.felled&&!selectedTrees.has(p.id)).sort((a,b)=>Math.hypot(a.x-s.stock.x,a.z-s.stock.z)-Math.hypot(b.x-s.stock.x,b.z-s.stock.z))[0];
    if(tree&&!queueProduction(s,tree.id,'fell_tree'))selectedTrees.add(tree.id);
   }
   if(s.materials.logs>=MATERIALS.logs.quantity)sellMaterial(s,'logs');
  }
  tick(s,.1);
 }
 rows.push({selectedTrees:[...selectedTrees],days,seed,biome,savings,town,opening,closing:s.money,orders,built:s.projects.filter(p=>!p.natural&&p.work>=PROJECTS[p.key].work).map(p=>p.key),food:s.materials.food,meals:s.materials.meals,minHunger:Math.min(...s.people.map(p=>p.needs.hunger)),outsideIncome:s.finances?.categories.outsideWork||0,restores:!!restore(save(s))});
 fs.writeFileSync(process.argv[2]||'/tmp/solar-bootstrap.json',JSON.stringify({kind:'Automated fresh-start commands: 21 days for tight capital, three for default/comfortable; not browser play',reference:ECONOMY_REFERENCE,rows},null,2));console.log(JSON.stringify(rows.at(-1)));
}

assert(rows.every(r=>r.orders.every(o=>!o.error)&&r.built.length===5&&r.minHunger>20&&r.food+r.meals>0&&r.closing>=0&&r.restores),'all starting configurations cover basic needs and save correctly');
console.log(`PASS all ${rows.length} fresh-start scenarios`);
