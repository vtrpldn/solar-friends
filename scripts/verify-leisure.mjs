import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import init, { Game } from '../web/pkg/solar_friends.js';
import { makeScenario } from '../web/dev/scenarios.js';

await init({module_or_path: await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm', import.meta.url))});
const template = new Game(), fresh = JSON.parse(template.snapshot());
assert(template.restore(await fs.readFile(new URL('../web/artwork/village-preview.json', import.meta.url), 'utf8')));
const established = JSON.parse(template.snapshot());
const work = new Set(['build','garden','gather','water','cook','compost','craft','visit']);
const hobbies = new Set(['nature_walk','birdwatch','stretch','daydream','stargaze']);
const leisure = new Set([...hobbies,'idle','rest','socialize']);
for (const scenario of ['arrival','leisure','hungry','surplus']) {
  const game = new Game();
  const state = makeScenario(scenario === 'surplus' ? 'leisure' : scenario, fresh, established);
  if (scenario === 'surplus') Object.assign(state.village, {food:150, meals:100});
  if (scenario === 'surplus') state.village.supplies.eggs = 60; // An intentionally overstocked fixture; expiry must lead to recovery.
  assert(game.restore(JSON.stringify(state)));
  const counts = Array.from({length:5}, () => ({awake:0,work:0,leisure:0,hobbies:new Set()}));
  let minStock = Infinity, maxStock = 0, maxHunger = 0, previousStock=state.village.food+state.village.meals, previousHarvests=state.village.harvests, previousExpired=0, emptyMinutes=0, longestEmpty=0;
  // Two weeks include several dry days, all kitchen rotations, and food recovery.
  for (let tick = 0; tick < 14 * 1920; tick++) {
    game.tick(.25);
    if (tick % 20) continue; // Sample every 15 game minutes.
    const snapshot = JSON.parse(game.snapshot()), {village:v,residents} = snapshot;
    const stock = v.food + v.meals;
    if (tick > 1920) minStock = Math.min(minStock, stock);
    maxStock = Math.max(maxStock, stock);
    assert(v.food >= 0 && v.meals >= 0 && v.water >= 0);
    assert(v.supplies.eggs <= (scenario === 'surplus' ? 60 : 12));
    assert(v.meals <= (scenario === 'surplus' ? 100 : 14), 'Concurrent cooks must stop when enough meals are ready');
    const expired=v.freshness.expired[16]+v.freshness.expired[17];
    if(scenario==='surplus'&&previousStock>50&&stock>50&&expired===previousExpired)assert.equal(v.harvests,previousHarvests,'Use an ample edible surplus before harvesting more');
    previousStock=stock;previousHarvests=v.harvests;previousExpired=expired;
    emptyMinutes=stock===0?emptyMinutes+15:0;longestEmpty=Math.max(longestEmpty,emptyMinutes);
    for (const r of residents) {
      const c = counts[r.id];
      maxHunger = Math.max(maxHunger, r.hunger);
      if (r.task !== 'sleep' && !r.trip) c.awake++;
      if (!r.trip && work.has(r.task)) c.work++;
      if (leisure.has(r.task)) c.leisure++;
      if (hobbies.has(r.task)) c.hobbies.add(r.task);
      assert.notEqual(r.task, 'visit', 'Free time must not become a productive building visit');
      assert(r.energy > 25 && r.hunger < 95, 'An autonomous village should not become exhausted or starve');
    }
    if (tick % 1920 === 0) {
      const restored = new Game();
      const saved=game.snapshot();
      if(!restored.restore(saved)){
        await fs.mkdir('artifacts/leisure',{recursive:true});await fs.writeFile('artifacts/leisure/invalid-checkpoint.json',saved);
        assert.fail(`${scenario} day ${1+Math.floor(v.minutes/1440)} checkpoint rejected; see artifacts/leisure/invalid-checkpoint.json`);
      }
      assert.equal(restored.snapshot(), game.snapshot(), 'Hobbies and pantry state survive reloading');
      restored.free();
    }
  }
  for (const c of counts) {
    assert(c.work / c.awake < .35, 'Every resident should spend a minority of in-village waking time working');
    assert(c.leisure / c.awake > .55, 'Most in-village waking time should be free time');
    assert(c.hobbies.size >= 3, 'Each resident needs varied hobbies, including evenings');
  }
  if(scenario==='surplus'){assert(previousExpired>0,'An oversized reserve should spoil rather than last forever');assert(longestEmpty<=240,'An overstocked pantry must recover within four hours after its old food expires');}
  else assert(minStock > 0, 'Food reserve must recover and stay available after the first day');
  assert(maxStock <= (scenario === 'surplus' ? 250 : 50), 'Autonomous food production must remain modest');
  console.log(`PASS: ${scenario}, 14 days, food reserve ${minStock}–${maxStock}, peak hunger ${maxHunger.toFixed(1)}, leisure ${Math.round(Math.min(...counts.map(c=>c.leisure/c.awake))*100)}%+ of each resident's in-village waking time`);
  game.free();
}
template.free();
