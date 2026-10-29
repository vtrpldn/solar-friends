import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {plantStroke} from '../web/editor/nature.js';
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const g=new Game();let checked=0;
try{
 const catalog=JSON.parse(g.scenario_catalog()).nature,d=JSON.parse(g.scenario_template('sandbox'));d.map=JSON.parse(g.generate_biome_property('mata-atlantica',42));d.map.nature=[];
 for(const species of catalog){
  const values=[species.min_size,species.max_size,Number(species.min_size.toFixed(2)),Number(species.max_size.toFixed(2)),species.max_size+1e-8,species.min_size-.01,species.max_size+.01,NaN,Infinity,'1'];
  for(const size of values){
   const candidate=structuredClone(d);candidate.map.nature=[{id:'size-probe',species:species.key,x:24,y:34,size}];const native=JSON.parse(g.validate_scenario(JSON.stringify(candidate))).ok;
   let accepted=false;try{const added=plantStroke(d,[],catalog,species.key,size,[[24,34]],1,()=> 'size-probe');accepted=added.length===1;}catch{}
   assert.equal(accepted,native,`${species.key}: JS and native disagree for ${String(size)}`);checked++;
  }
 }
 console.log(`PASS ${checked} plant size boundaries agree with native compilation, including rounded slider endpoints, representable near-boundary values and invalid inputs.`);
}finally{g.free();}
