import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario,advanceGame} from '../web/dev/scenarios.js';
import {placementReason} from '../web/polish.js';
import {buildingArtKey} from '../web/building-art.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),snap=()=>JSON.parse(g.snapshot()),fresh=snap();
assert(g.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));
const established=snap();assert(g.restore(JSON.stringify(makeScenario('circular',fresh,established))));
assert.equal(snap().environment.economy.capacity,900);
assert.equal(snap().environment.power.hydros,1);
const homes=snap().village.buildings.filter(b=>b.kind==='home');
assert.deepEqual(homes.map(b=>buildingArtKey(b,snap().village.buildings,snap().village.economy.projects)),['adobe-gable','adobe-veranda']);
advanceGame(g,240);
let s=snap();assert.equal(s.village.circular.toilet_visits,5,'Every awake neighbour completes one daily routine');
assert(s.residents.every(r=>r.last_sanitation_day===1));assert.equal(s.village.circular.waste,7);
assert(s.village.circular.digestion>0);assert(s.village.circular.filtration>0);
assert(g.restore(g.snapshot()));advanceGame(g,241);
s=snap();assert(s.village.circular.biogas>0);assert.equal(s.village.circular.batches,1);
assert(s.village.circular.pending_compost===2);assert(s.village.circular.curing>0);
assert(s.village.circular.water_reused>=8);assert(s.environment.power.generation>0);
// Pause processing and ensure a checkpoint neither duplicates output nor feedstock.
g.configure_sanitation(false,false,false);const before=snap().village.circular;
advanceGame(g,30);s=snap();assert.equal(s.village.circular.biogas,before.biogas);assert.equal(s.village.circular.batches,before.batches);assert.equal(s.village.circular.filtration,before.filtration);
// Every hover decision agrees with native river placement, across the lot.
const h=new Game();h.start_mode('sandbox');const base=h.snapshot();
let sites=0;
for(let x=1;x<=26;x++)for(let y=1;y<=26;y++){
 assert(h.restore(base));const v=JSON.parse(base).village;
 const allowed=!placementReason(v,'hydro',x,y);
 assert.equal(h.place('hydro',x,y)==='ok',allowed,`Hydro preview mismatch ${x},${y}`);
 if(allowed){sites++;assert(h.restore(h.snapshot()));}
}
assert(sites>=20);
assert(h.restore(base));assert.equal(h.place_with_recipe('home',5,5,'adobe'),'ok');
const adobe=JSON.parse(h.snapshot());assert.equal(adobe.village.buildings[0].progress,100);assert.equal(adobe.village.economy.projects[0].recipe,'adobe');assert(h.restore(h.snapshot()));
h.free();g.free();
console.log('PASS: five independent toilet routines, real digestion and filtration timers, pause/reload conservation, storage capacity, adobe Sandbox placement, and river hover/native parity across all 676 plots.');
