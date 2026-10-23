import {soilAppearance} from '../terrain.js';
import {terrainRevision} from '../terrain-revision.js';

// Retain only the last completed interactive landscape per live art library.
// Detached thumbnail renderers may borrow its canvas; no transferred bitmap is
// shared or left with ambiguous ownership.
const completed=new WeakMap();
export function terrainInputs(definition,snapshot){
 const land=snapshot.village.land,roads=definition.start.roads,soil=soilAppearance(land.soil);
 return {key:JSON.stringify([land.seed,roads,soil,definition.map.river,definition.map.biome,terrainRevision(definition.map)]),request:{seed:land.seed,roads,soil,map:definition.map}};
}
export function completedTerrain(art,key){const entry=completed.get(art);return entry?.key===key?entry.canvas:null;}
export function rememberTerrain(art,key,canvas){completed.set(art,{key,canvas});}
