import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {MAP_SIZE} from '../web/terrain.js';
import {scenarios,makeScenario} from '../web/dev/scenarios.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const middle=MAP_SIZE/2;
for(const mode of ['story','sandbox']){
  const game=new Game();
  try{
    assert(game.start_mode(mode));
    const state=JSON.parse(game.snapshot()),v=state.village;
    assert.deepEqual(v.camp,[middle,middle]);
    assert(v.buildings.every(b=>Math.abs(b.x-middle)<=4&&Math.abs(b.y-middle)<=4));
    assert(state.residents.every(r=>Math.abs(r.target_x-middle)<=3&&r.target_y===middle));
    const store=v.logistics.stores.find(s=>s.owner.kind==='camp');
    assert.deepEqual([store.x,store.y],v.camp);
    assert(game.restore(game.snapshot()),'Centered ownership survives save/reload');
    assert.notEqual(game.place('home',middle,middle),'ok','Keep the centered arrival clearing free');
    const invalid=JSON.parse(game.snapshot());invalid.village.camp=[0,0];
    assert(!game.restore(JSON.stringify(invalid)),'Reject invalid camp coordinates atomically');
  }finally{game.free();}
}
let checked=0;
for(const scene of scenarios.filter(s=>!['copy','imported'].includes(s.id))){
  const game=new Game();
  try{
    game.start_mode('story');const fresh=JSON.parse(game.snapshot());
    assert(game.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));
    const authored=makeScenario(scene.id,fresh,JSON.parse(game.snapshot()));
    assert(game.restore(JSON.stringify(authored)),`${scene.id}: centered layout must pass simulation validation`);
    assert.deepEqual(JSON.parse(game.snapshot()).village.camp,[middle,middle],scene.id);
    checked++;
  }finally{game.free();}
}
console.log(`PASS: centered Story and Sandbox starts, owned supplies, arrival clearing, exact saves, invalid camp rejection, and ${checked} developer scenes.`);
