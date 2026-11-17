import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ECONOMY_REFERENCE} from '../web/v02/weekend/economy-reference.js';
import {createWeekend,chooseCamp,enableFastNavigation,plan,placementError,tick,PROJECTS,save,restore} from '../web/v02/weekend/simulation.js';
import {applySettings,DEFAULT_SETTINGS} from '../web/v02/weekend/world-settings.js';
import {setOutsideWork} from '../web/v02/weekend/outside-work.js';
const rows=[];
for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const savings of ['tight','modest','comfortable'])for(const town of ['nearby','remote']){
 const seed=42+rows.length,s=createWeekend(seed);applySettings(s,{...DEFAULT_SETTINGS,biome,savings,town});chooseCamp(s,'entrance');enableFastNavigation(s);
 const opening=s.money,orders=[];
 for(const key of ['gathering','water','toilet','shelter','covered-stores']){
  let spot;for(let radius=3;radius<16&&!spot;radius++)for(let z=s.stock.z-radius;z<=s.stock.z+radius&&!spot;z++)for(let x=s.stock.x-radius;x<=s.stock.x+radius&&!spot;x++)if(!placementError(s,key,x,z))spot={x,z};
  orders.push({key,error:spot?plan(s,key,spot.x,spot.z):'No nearby placement'});
 }
 // A player chooses two optional jobs; all food, wages and construction use the
 // normal command path. No injected inventory, money or completed buildings.
 setOutsideWork(s,s.people[0],true);setOutsideWork(s,s.people[1],true);
 for(let i=0;i<96000;i++)tick(s,.1);
 rows.push({seed,biome,savings,town,opening,closing:s.money,orders,built:s.projects.filter(p=>!p.natural&&p.work>=PROJECTS[p.key].work).map(p=>p.key),food:s.materials.food,meals:s.materials.meals,minHunger:Math.min(...s.people.map(p=>p.needs.hunger)),outsideIncome:s.finances?.categories.outsideWork||0,restores:!!restore(save(s))});
 fs.writeFileSync(process.argv[2]||'/tmp/solar-bootstrap.json',JSON.stringify({kind:'Automated three-day fresh-start commands; not browser play',reference:ECONOMY_REFERENCE,rows},null,2));console.log(JSON.stringify(rows.at(-1)));
}

assert(rows.every(r=>r.orders.every(o=>!o.error)&&r.built.length===5&&r.minHunger>20&&r.food+r.meals>0&&r.closing>=0&&r.restores),'all starting configurations cover basic needs and save correctly');
console.log('PASS all 18 fresh-start scenarios');
