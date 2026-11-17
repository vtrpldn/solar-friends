import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {DEFAULT_SETTINGS,PRESETS,applySettings} from '../web/v02/weekend/world-settings.js';
import {setOutsideWork} from '../web/v02/weekend/outside-work.js';
const scenarios={default:DEFAULT_SETTINGS,tight:{...DEFAULT_SETTINGS,savings:'tight',supplies:'essentials'},remote:{...DEFAULT_SETTINGS,...PRESETS.remote,biome:'caatinga'}};
for(const [name,settings]of Object.entries(scenarios)){
 let s=createWeekend(42);applySettings(s,settings);assert(chooseCamp(s,'entrance'));enableFastNavigation(s);
 for(const r of s.people)setOutsideWork(s,r,true);
 for(let day=1;day<=30;day++){
  for(let step=0;step<32000;step++)tick(s,.1);
  assert(s.people.every(r=>Number.isFinite(r.needs.hydration)&&r.needs.hydration>=0));
  const loaded=restore(save(s));assert(loaded,`${name} day ${day} restores`);
  // Exercise a real reload weekly, including the migration validators and job ownership.
  if(day%7===0){s=loaded;enableFastNavigation(s);}
  if(day%5===0)console.log(JSON.stringify({scenario:name,day,money:Math.round(s.money),food:s.materials.food,water:s.infrastructure.nodes[0].water[0],residents:s.people.map(r=>({name:r.name,hunger:Math.round(r.needs.hunger),hydration:Math.round(r.needs.hydration),energy:Math.round(r.energy),action:r.action,blocked:r.needBlocked}))}));
 }
 assert(s.people.every(r=>r.needs.hunger>15&&r.needs.hydration>15&&r.energy>15),`${name}: residents recover and meet physical needs`);
 assert(s.money>=0,`${name}: no negative money`);
}
console.log('PASS three ordinary-command 30-day starts, without diagnostic resource injections');
