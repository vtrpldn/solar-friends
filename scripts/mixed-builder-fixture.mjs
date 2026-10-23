import assert from 'node:assert/strict';
import {residentPartRecipe} from '../web/resident-part-recipe.js';
// Authored content compiled through the same validator as imported creations.
// This is a stress fixture, not a balanced village or an example scenario.
export function mixedBuilderFixture(game,template,{population=12,custom=true}={}){
 const definition=structuredClone(template),catalog=JSON.parse(game.scenario_catalog());
 definition.id='mixed-builder-stress-v1';definition.title='Mixed village stress fixture';
 definition.start.residents=Array.from({length:population},(_,i)=>({...structuredClone(catalog.resident_presets[i%catalog.resident_presets.length]),id:`stress-person-${i}`,name:`Neighbour ${i+1}`,...(custom?{appearance:residentPartRecipe({hair:i%2?'side-part-v1':'short-curls-v1',hairColour:['chestnut','espresso','black','silver'][Math.floor(i/2)%4],hat:i%3?'straw-v1':'none',materials:{skin:['warm','copper','sunlit'][Math.floor(i/4)%3],shirt:['teal','cream','indigo','terracotta'][i%4],shorts:['sage','cream','umber'][i%3],shoes:i%2?'graphite':'brown'}})}:{})}));
 const types=catalog.buildings.filter(b=>b.id!=='hydro'),[cx,cy]=definition.map.camp;let attempted=0;
 for(let y=2;y<61&&definition.start.buildings.length<catalog.max_buildings;y+=3)for(let x=2;x<61&&definition.start.buildings.length<catalog.max_buildings;x+=3){
  if(Math.abs(x-cx)<12&&Math.abs(y-cy)<12)continue;
  const type=types[definition.start.buildings.length%types.length],appearance=type.appearances.length?type.appearances[definition.start.buildings.length%type.appearances.length]:null;
  const building={id:`stress-${x}-${y}`,kind:type.id,x,y,state:'completed',recipe:appearance?.startsWith('adobe')?'adobe':'standard',appearance};
  definition.start.buildings.push(building);attempted++;
  if(!JSON.parse(game.validate_scenario(JSON.stringify(definition))).ok)definition.start.buildings.pop();
 }
 const validation=JSON.parse(game.validate_scenario(JSON.stringify(definition)));assert(validation.ok,JSON.stringify(validation));assert.equal(definition.start.buildings.length,catalog.max_buildings,'Stress fixture must reach the published building limit');
 return {definition,summary:{population,buildings:definition.start.buildings.length,types:Object.fromEntries(types.map(t=>[t.id,definition.start.buildings.filter(b=>b.kind===t.id).length])),custom,attempted,seed:definition.map.seed}};
}
