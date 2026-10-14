import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {allBuildingArt,buildingArtKey} from '../web/building-art.js';
import {makeArtPreview} from '../web/dev/art-preview.js';
import {makeScenario,advanceGame} from '../web/dev/scenarios.js';
import {placementReason} from '../web/polish.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),fresh=JSON.parse(game.snapshot());
assert(game.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));
const established=JSON.parse(game.snapshot()),untouched=JSON.stringify({fresh,established});
let coordinates;
for(const night of [false,true]){
  const preview=makeArtPreview(fresh,established,{night});
  assert.equal(JSON.stringify({fresh,established}),untouched,'Building the showcase cannot mutate source villages');
  assert(game.restore(JSON.stringify(preview)),'The complete gallery must be a valid simulation state');
  const snapshot=JSON.parse(game.snapshot()),v=snapshot.village;
  assert.equal(v.buildings.length,Object.keys(allBuildingArt).length);
  const rendered=v.buildings.map(b=>buildingArtKey(b,v.buildings,v.economy.projects));
  assert.deepEqual([...rendered].sort(),Object.keys(allBuildingArt).sort(),'Every registered building and house skin must actually render once');
  assert(v.buildings.every(b=>b.progress===100));
  for(const b of v.buildings){const rest={...v,buildings:v.buildings.filter(other=>other.id!==b.id)};assert.equal(placementReason(rest,b.kind,b.x,b.y),'',`${b.kind}: an unobstructed legal plot`);}
  assert.equal(v.economy.sources.length,0);assert.equal(v.minutes%1440,night?1260:600);
  const layout=v.buildings.map(b=>[b.id,b.kind,b.x,b.y]);
  if(coordinates)assert.deepEqual(layout,coordinates,'Day/night toggles must preserve the same layout');else coordinates=layout;
  assert.deepEqual(makeScenario(night?'art-night':'art',fresh,established),preview);
  advanceGame(game,.75);assert(game.restore(game.snapshot()),'The showcase remains valid after real simulation ticks');
}
const grid=makeScenario('grid',fresh,established);
assert(game.restore(JSON.stringify(grid)),'The complete road-edge gallery must remain save-valid');
assert.equal(grid.village.buildings.length,Object.keys(allBuildingArt).length);
assert(grid.village.roads.length>0);
game.free();console.log(`PASS: all ${Object.keys(allBuildingArt).length} building variants render exactly once in legal completed plots, with matching day/night layouts, valid simulation and unchanged source villages.`);
