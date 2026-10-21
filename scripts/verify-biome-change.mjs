import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {planBiomeChange,suggestedReplacement,compatibleSpecies} from '../web/editor/biome-change.js';
import {EditorDocument} from '../web/editor/document.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game();
try{
 const catalog=JSON.parse(g.scenario_catalog());
 for(const from of catalog.biomes)for(const target of catalog.biomes){
  const d=JSON.parse(g.scenario_template('sandbox'));d.map=JSON.parse(g.generate_biome_property(from.id,42));d.rules.climate=true;
  const original=JSON.stringify(d),pending=planBiomeChange(d,catalog,{target:target.id});assert.equal(JSON.stringify(d),original);
  assert.equal(pending.unresolved.length>0,from.id!==target.id);
  const replacements=Object.fromEntries(pending.groups.map(p=>[p.key,suggestedReplacement(p.key,target.id,catalog)]));
  const result=planBiomeChange(d,catalog,{target:target.id,replacements,weather:'keep'});
  assert.equal(result.unresolved.length,0);assert.deepEqual(result.candidate.start,d.start);assert.deepEqual(result.candidate.map.river,d.map.river);assert.deepEqual(result.candidate.map.deposits,d.map.deposits);assert.deepEqual(result.candidate.map.clearings,d.map.clearings);
  assert.deepEqual(result.candidate.map.nature.map(p=>[p.id,p.x,p.y,p.size]),d.map.nature.map(p=>[p.id,p.x,p.y,p.size]));
  assert.deepEqual(result.after,from.weather);assert.deepEqual(result.candidate.map.terrain.map(p=>[p.fertility,p.retention,p.cover]),d.map.terrain.map(p=>[p.fertility,p.retention,p.cover]));
  assert(result.candidate.map.nature.every(p=>compatibleSpecies(p.species,target.id)));
  assert.equal(JSON.parse(g.load_scenario(JSON.stringify(result.candidate))).ok,true);
  const doc=new EditorDocument(d);doc.transact('Switch biome',draft=>Object.assign(draft,result.candidate));const changed=doc.value;doc.undo();assert.deepEqual(doc.value,d);doc.redo();assert.deepEqual(doc.value,changed);
  const destination=planBiomeChange(d,catalog,{target:target.id,replacements,terrain:'keep'});assert.deepEqual(destination.candidate.map.terrain,d.map.terrain);assert.deepEqual(destination.after,target.weather);
  const removed=planBiomeChange(d,catalog,{target:target.id,replacements:Object.fromEntries(pending.groups.map(p=>[p.key,'remove']))});assert.equal(removed.removed,pending.groups.reduce((n,g)=>n+g.count,0));assert.equal(removed.candidate.map.nature.length,d.map.nature.length-removed.removed);
 }
 const d=JSON.parse(g.scenario_template('sandbox'));d.map=JSON.parse(g.generate_biome_property('cerrado',7));d.rules.weather={...catalog.weather,intro_days:3};
 assert.deepEqual(planBiomeChange(d,catalog,{target:'caatinga',weather:'keep'}).after,d.rules.weather);
 const defaults=planBiomeChange(d,catalog,{target:'caatinga',terrain:'defaults'});assert(defaults.groundChanged>0);const h=catalog.habitats.find(h=>h.key==='caatinga-woodland');assert(defaults.candidate.map.terrain.filter(c=>c.habitat===h.key).every(c=>c.fertility===h.fertility&&c.retention===h.retention&&c.cover===h.cover));
 assert.equal(suggestedReplacement('forest-ferns','caatinga',catalog),'macambira');
 assert.equal(suggestedReplacement('jucara','caatinga',catalog),'jurema-preta');
 const future=structuredClone(d);future.map.biome.version=99;delete future.rules.weather;assert.throws(()=>planBiomeChange(future,catalog,{target:'caatinga',weather:'keep'}),/unavailable/);
 assert.throws(()=>planBiomeChange(d,catalog,{target:'missing'}));
 console.log('PASS all nine biome transitions: explicit unresolved groups, compatible remapping, preserved world setup/identities/soil, optional defaults and removal, native compilation and exact one-step undo/redo.');
}finally{g.free();}
