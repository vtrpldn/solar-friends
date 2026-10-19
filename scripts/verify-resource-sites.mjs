import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario,advanceGame} from '../web/dev/scenarios.js';
import {placementReason} from '../web/polish.js';
import {sourceKinds} from '../web/resource-sites.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),snap=()=>JSON.parse(g.snapshot()),fresh=snap();assert.equal(fresh.village.economy.sources.length,0);
assert(g.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));const old=snap();assert.equal(old.village.economy.sources.length,0,'Legacy fixed sites are retired');
assert(g.restore(JSON.stringify(makeScenario('cultivation',fresh,old))));
const trees=snap().village.economy.sources[0];assert.equal(trees.growth,.75);assert.equal(trees.remaining,0);
advanceGame(g,1440);advanceGame(g,1);for(let hours=0;hours<24&&snap().village.economy.sources.slice(0,2).some(s=>s.growth<1);hours++)advanceGame(g,60);let s=snap();assert.equal(s.village.economy.sources[0].growth,1);assert.equal(s.village.economy.sources[0].remaining,32);assert.equal(s.village.economy.sources[1].remaining,24);
assert(g.restore(g.snapshot()));assert.equal(g.harvest_source(0),'ok');const before=snap().village.wood;
// A distant harvest may span lunch and a later personal work session.
for(let frame=0;frame<2*1920&&snap().village.economy.sources[0].harvest_requested;frame++)g.tick(.25);
s=snap();assert.equal(s.village.wood,before+8);assert.equal(s.village.economy.sources[0].remaining,24);assert(!s.village.economy.sources[0].harvest_requested);
assert(g.restore(g.snapshot()));assert.equal(g.configure_source(0,false,false),'ok');assert(g.restore(g.snapshot()));
const h=new Game();startEmptySandbox(h);const baseline=h.snapshot();let plots=0;
for(let material=0;material<5;material++)for(let x=1;x<=26;x++)for(let y=1;y<=26;y++){
 assert(h.restore(baseline));const v=JSON.parse(baseline).village,allowed=!placementReason(v,sourceKinds[material],x,y);
 assert.equal(h.place_source(material,x,y)==='ok',allowed,`Plot hover/native mismatch ${material} ${x},${y}`);if(allowed){plots++;assert(h.restore(h.snapshot()));}
}
assert(h.restore(baseline));assert.equal(h.place_source(3,18,18),'ok');assert.equal(h.place_source(3,40,23),'ok');assert.equal(h.harvest_source(0),'ok');
const placed=JSON.parse(h.snapshot());assert.equal(placed.village.economy.land[1],96);assert.equal(h.clear_source(0),'ok');assert.equal(h.place_source(3,18,18),'ok');assert.equal(JSON.parse(h.snapshot()).village.economy.sources[2].remaining,placed.village.economy.sources[0].remaining);
g.free();h.free();console.log(`PASS: empty new villages, retired fixed props, resident-tended growth, whole-tree harvest, saved settings, finite reserve placement, stable clear/replant, and ${plots} valid placements across all 3380 plot previews.`);
