import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations,stageFixtureMaterial} from '../web/dev/material-fixture.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/organics',{recursive:true});
const snap=g=>JSON.parse(g.snapshot()),g=new Game();startEmptySandbox(g);
for(const [kind,x,y] of [['compost',8,8],['garden',12,8],['kitchen',5,11]])assert.equal(g.place(kind,x,y),'ok');
const fixture=snap(g);Object.assign(fixture.village,{mode:'story',minutes:540,arrived:true,food:36,meals:16,water:40});
Object.assign(fixture.village.progress,{completed:Array(4).fill(true),later_completed:Array(9).fill(true),compost:0,scraps:2,use_tools:false});
fixture.village.economy.outside_jobs=Object.fromEntries(Array.from({length:5},(_,id)=>[id,false]));
for(const r of fixture.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:0,social:90,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null,activity_store:null,activity_material:null,activity_building:null,walking:{},last_meal_slot:0});
assert(g.restore(JSON.stringify(resetMaterialLocations(fixture))));
// The last two scraps may be at different locations; a full recipe must still be deliverable.
const split=snap(g);stageFixtureMaterial(split,{kind:'pantry',id:2},20,1);assert(g.restore(JSON.stringify(split)));g.set_production_target(17,0);
let sawScraps=false,sawCompost=false,sawLocal=false,done=false;
for(let frame=0;frame<25000;frame++){
 const s=snap(g),v=s.village,stores=v.logistics.stores,shipments=v.logistics.shipments;
 for(const [i,key] of [[19,'compost'],[20,'scraps']])assert.equal(v.progress[key],stores.reduce((n,p)=>n+p.items[i],0)+shipments.filter(h=>h.carrying&&h.material===i).reduce((n,h)=>n+h.amount,0));
 const cargo=shipments.find(h=>h.carrying&&(h.material===19||h.material===20));
 if(cargo){const key=cargo.material===20?'scraps':'compost';if(key==='scraps')sawScraps=true;else sawCompost=true;
  const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();
  if(frame%8===0)await writeFile(`artifacts/organics/${key}-cargo.json`,saved);
 }
 if(stores.some(p=>p.owner.kind==='pantry'&&p.owner.id===0&&p.items[19]>0))sawLocal=true;
 if(v.progress.enriched_harvests>0){done=true;break;}
 g.tick(.25);
}
assert(sawScraps,'A resident carried the scraps from camp to the compost station');
assert(sawLocal,'The resident left mature compost at the station');
assert(sawCompost,'A separate real shipment carried compost to the growing plot');
assert(done,'The resident used delivered compost in an actual harvest');
const saved=g.snapshot();assert(g.restore(saved));assert.equal(g.snapshot(),saved);await writeFile('artifacts/organics/harvest.json',saved);
const s=snap(g),balance=JSON.parse(g.simulation_report()).materials;assert(balance.every(m=>m.difference===0),'Located organic transfers preserve the material ledger');
let items=Array(s.environment.economy.materials.length).fill(0);items[20]=1;assert.match(g.order_supplies(JSON.stringify(items)),/scraps/);assert.match(g.sell_material(20,1),/locally/);
g.free();console.log('PASS: real scraps delivery, local compost turning, separate compost hauling, enriched harvest, exact cargo saves, located totals and material conservation.');
