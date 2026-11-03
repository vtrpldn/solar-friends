import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import init,{Game} from '../web/pkg/solar_friends.js';
import {advanceSimulation} from '../web/simulation-speed.js';
import {removeResident} from '../web/editor/roster.js';
import {EditorDocument} from '../web/editor/document.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),catalog=JSON.parse(g.scenario_catalog()),results=[];
const summary=a=>{a.sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)]};};
try{
 const draft=JSON.parse(g.scenario_template('sandbox')),doc=new EditorDocument(draft);
 doc.transact('authored cast fixture',d=>{d.start.residents.push({...structuredClone(d.start.residents[0]),id:'duplicate'});});
 assert.equal(doc.value.start.residents.length,6);assert.equal((doc.value.start.relationships??[]).length,0);
 doc.undo();assert.deepEqual(doc.value,draft);doc.redo();assert.equal(doc.value.start.residents.length,6);
 doc.transact('history',d=>{d.start.relationships=[{from:'duplicate',to:d.start.residents[0].id,memories:7}];});
 const before=doc.value;doc.transact('remove',d=>removeResident(d,catalog.resident_presets,'duplicate'));
 assert.equal((doc.value.start.relationships??[]).length,0);doc.undo();assert.deepEqual(doc.value,before);
 for(const biome of catalog.biomes)for(const count of [1,2,5,catalog.max_residents])for(const looks of ['shared','mixed']){
  const d=JSON.parse(g.scenario_template('sandbox'));
  d.map=JSON.parse(g.generate_biome_property(biome.id,42));
  Object.assign(d.rules,{logistics:true,land:true,utilities:true,climate:true,learning:true,market:true,maintenance:true,weather:biome.weather});
  d.start.residents=Array.from({length:count},(_,i)=>({...structuredClone(catalog.resident_presets[i%5]),id:`friend-${String(i).padStart(2,'0')}`,name:`Amigo ${i}`,appearance:{preset:looks==='shared'?'iara':catalog.resident_presets[i%5].preset,version:1}}));
  const begin=performance.now(),report=JSON.parse(g.load_scenario(JSON.stringify(d))),compile=performance.now()-begin;
  assert(report.ok,JSON.stringify(report));assert.equal(JSON.parse(g.snapshot()).residents.length,count);
  const speeds={};
  for(const speed of [1,16]){
   const frames=[];
   for(let frame=0;frame<120;frame++){const t=performance.now();advanceSimulation(g,1/60,speed);g.frame_state();frames.push(performance.now()-t);}
   speeds[speed]=summary(frames);
  }
  const raw=g.snapshot(),s=JSON.parse(raw);assert(s.village.arrived,`${biome.id}: ${count} friends must reach camp`);
  assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));
  assert(g.restore(raw));assert.equal(g.snapshot(),raw,'Exact authored-cast checkpoint');
  assert.equal(new Set(s.residents.map(p=>p.id)).size,count);
  assert.equal(Object.keys(s.village.scenario.residents).length,count);
  results.push({biome:biome.id,count,looks,map:64,compile,speeds,snapshotBytes:raw.length});
  console.error(`PASS ${biome.id} ${count} residents ${looks}`);
 }
 const unchanged=g.snapshot(),bad=JSON.parse(g.scenario_template('sandbox'));bad.start.residents=[];
 assert.equal(JSON.parse(g.load_scenario(JSON.stringify(bad))).ok,false);assert.equal(g.snapshot(),unchanged);
 console.log(JSON.stringify({engine:'wasm',maximum:catalog.max_residents,framesPerSpeed:120,note:'Engine and compact frame sampling only; shared/mixed bundled looks, not unique modular artwork or browser frame rate.',results},null,2));
}finally{g.free();}
