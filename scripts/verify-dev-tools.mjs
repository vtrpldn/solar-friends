import { readArtDraft } from '../web/dev/art-draft.js';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import init, { Game } from '../web/pkg/solar_friends.js';
import { scenarios, makeScenario, advanceGame } from '../web/dev/scenarios.js';
import { measureAlpha, compareAlpha } from '../web/artwork/pixel-checks.js';
await init({module_or_path:await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm', import.meta.url))});
const g = new Game(), fresh = JSON.parse(g.snapshot());
assert(g.restore(await fs.readFile(new URL('../web/artwork/village-preview.json', import.meta.url), 'utf8')));
const established = JSON.parse(g.snapshot());
for(const scenario of scenarios) {
  assert(g.restore(JSON.stringify(makeScenario(scenario.id,fresh,established))), scenario.id);
  g.dev_observe(true);
  const before = g.snapshot(), minute = JSON.parse(before).village.minutes;
  g.dev_inspect(); assert.equal(g.snapshot(),before,'inspection must not mutate state');
  advanceGame(g,.75);
  const after = JSON.parse(g.snapshot());
  assert.equal(after.village.minutes,minute+.75);
  if(scenario.id==='cook') assert.equal(after.village.situations.active.resident,2);
  if(scenario.id==='coop') assert.equal(after.village.supplies.eggs,3);
  if(scenario.id==='leisure') assert(after.residents.every(r=>['nature_walk','birdwatch','stretch','daydream'].includes(r.task)));
  assert(g.restore(g.snapshot()),'scenario must remain save-valid');
}
const before = g.snapshot();
for(const invalid of [NaN,Infinity,-1,0,1441]) assert.throws(()=>advanceGame(g,invalid));
assert.equal(g.snapshot(),before);
// COPY-01: a built kitchen with ingredients but no cooked meals must not
// claim it is still waiting for the kitchen to be built.
const ingredients=makeScenario('village',fresh,established);
assert(ingredients.village.buildings.some(b=>b.kind==='kitchen'&&b.progress>=100));
ingredients.village.meals=0;
for(const resident of ingredients.residents)resident.hunger=85;
assert(g.restore(JSON.stringify(ingredients)));
advanceGame(g,.75);
for(const resident of JSON.parse(g.snapshot()).residents) {
  assert.equal(resident.task,'eat');
  assert.equal(resident.reason,'Eating available ingredients while we wait for a cooked meal.');
}
assert.throws(()=>makeScenario('missing',fresh,established));
const pixels = new Uint8ClampedArray(4*4*4); pixels[(1*4+2)*4+3]=255;
assert.deepEqual(measureAlpha(pixels,4,4).bounds,[2,1,2,1]);
assert.equal(compareAlpha(pixels,pixels),1);
assert.equal(compareAlpha(pixels,new Uint8ClampedArray(pixels.length)),0);
g.free();
console.log(`PASS: all ${scenarios.length} validated scenarios, exact stepping, real hobbies, concern and eggs, read-only diagnostics and alpha measurements`);

execFileSync(process.execPath,['scripts/sync-art-prompts.mjs','--check']);
const draft = { version:1,asset:'coop',config:{width:100,anchor:.75,axes:[.5,-.5]},candidate:null };
const storage = { getItem:()=>JSON.stringify(draft) };
assert.equal(readArtDraft('coop',storage).sprite.name,'Chicken coop');
assert.throws(()=>readArtDraft('home',storage));
draft.config.axes=[0,0];assert.throws(()=>readArtDraft('coop',storage));
draft.config=null;draft.candidate='https://example.com/image.png';assert.throws(()=>readArtDraft('coop',storage));
