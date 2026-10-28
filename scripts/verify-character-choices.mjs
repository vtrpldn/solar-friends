import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {characterCategories,randomizeCharacter,resetCharacterCategory} from '../web/editor/character-choices.js';
import {residentPartRecipe} from '../web/resident-part-recipe.js';
import {residentFile} from '../web/editor/resident-presets.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),catalog=JSON.parse(g.scenario_catalog()),baseline=structuredClone(catalog.resident_presets[0]);
let seed=8197;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
try{
 const before=g.snapshot(),categories=Object.keys(characterCategories),styles=new Set();let checked=0;
 for(const custom of [false,true]){const baseline=structuredClone(catalog.resident_presets[0]);if(custom)baseline.appearance={...residentPartRecipe({body:'relaxed-v1'}),assetVersion:'resident-parts-v4'};
 for(let mask=0;mask<16;mask++)for(let trial=0;trial<20;trial++){
  const locked=Object.fromEntries(categories.map((name,i)=>[name,Boolean(mask&(1<<i))])),person=randomizeCharacter(baseline,locked,catalog,random);
  assert.equal(person.id,baseline.id);assert.equal(person.preset,baseline.preset);assert.equal(person.preset_version,baseline.preset_version);
  for(const name of categories)if(locked[name])for(const field of characterCategories[name])assert.deepEqual(person[field],baseline[field]);
  for(const unrestricted of [false,true])assert(JSON.parse(g.validate_resident_preset(JSON.stringify(residentFile(person)),unrestricted)).ok);
  for(const name of categories){const reset=resetCharacterCategory(person,baseline,name);for(const field of characterCategories[name])assert.deepEqual(reset[field],baseline[field]);for(const other of categories.filter(n=>n!==name))for(const field of characterCategories[other])assert.deepEqual(reset[field],person[field]);}
  if(custom&&!locked.Appearance)styles.add(person.appearance.assetVersion);
  if(custom)assert.equal(baseline.appearance.assetVersion,'resident-parts-v4');else assert.deepEqual(catalog.resident_presets[0],baseline);checked++;
 }
 }
 assert.deepEqual([...styles].sort(),['resident-parts-v1','resident-parts-v3','resident-parts-v4']);
 assert.equal(g.snapshot(),before,'Choice generation and validation are read-only');
 assert.throws(()=>randomizeCharacter(baseline,{},catalog,()=>1));assert.throws(()=>resetCharacterCategory(baseline,baseline,'Unknown'));
 const fresh={...baseline,appearance:{preset:'nina',version:1}};delete baseline.appearance;assert(!Object.hasOwn(resetCharacterCategory(fresh,baseline,'Appearance'),'appearance'));
 console.log(`PASS: ${checked} generated characters across all 16 lock combinations, both native budgets, category-only reset, optional-field restoration, identity preservation and read-only validation.`);
}finally{g.free();}
