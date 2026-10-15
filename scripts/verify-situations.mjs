import {restockFixtureFood} from '../web/dev/material-fixture.js';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import init, { Game } from '../web/pkg/solar_friends.js';
import { situationView } from '../web/situations.js';
await init({ module_or_path: await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm', import.meta.url)) });
const output = process.argv[2];
if (output) await fs.mkdir(output, { recursive: true });
const snapshot = g => JSON.parse(g.snapshot());
function until(g, predicate, label, limit = 25000, beforeTick = () => {}) {
  for (let i = 0; i < limit; i++) {
    if (predicate(snapshot(g))) return;
    beforeTick(g);
    g.tick(0.25);
  }
  throw new Error(`${label}: ${g.snapshot()}`);
}
const game = new Game();
assert.match(situationView(snapshot(game).village, snapshot(game).residents).markup, /no one has raised a concern/);
until(game, s => s.village.arrived, 'arrival');
for (const [kind, x, y, cost] of [
  ['well', 6, 10, 18], ['home', 8, 8, 32], ['garden', 13, 10, 12],
  ['kitchen', 10, 10, 40], ['home', 12, 7, 32],
]) {

  assert.equal(game.place(kind, x, y), 'ok');
  const missing=snapshot(game).environment.economy.shortage;if(missing.some(n=>n))assert.equal(game.order_supplies(JSON.stringify(missing)),'ok');
  until(game, s => s.village.buildings.at(-1).progress >= 100, `finish ${kind}`);
}
// Building visits now share cooking naturally. Deliberately assign repeated
// kitchen work to one resident to exercise the unequal-work concern.
// Stock the scenario; all cooking records still come from completed tasks.
const stocked = JSON.parse(game.snapshot());
stocked.village.food = 300;
assert(game.restore(JSON.stringify(restockFixtureFood(stocked))));
until(game, s => s.village.situations.active !== null, 'an organic cooking concern', 25000, g => {
  if (snapshot(g).residents.find(r => r.id === 2).task !== 'cook') g.request(2, 'cook', true);
});
const concern = game.snapshot();
if (output) await fs.writeFile(`${output}/solar-concern.json`, concern);
console.log('Concern emerged from real cooking on day', 1 + Math.floor(snapshot(game).village.minutes / 1440));
for (const response of ['share_shifts', 'day_off']) {
  const g = new Game();
  assert(g.restore(concern));
  const before = g.snapshot();
  assert.notEqual(g.respond_situation('unknown'), 'ok');
  assert.equal(g.snapshot(), before);
  assert.equal(g.respond_situation(response), 'ok');
  const agreement = g.snapshot();
  const id = snapshot(g).village.situations.active.resident;
  assert.notEqual(g.respond_situation(response), 'ok');
  assert.equal(g.snapshot(), agreement);
  assert.match(g.request(id, 'cook', true), /agreed/);
  if (response === 'day_off') assert.match(g.request(id, 'gather', true), /agreed/);
  const restored = new Game();
  assert(restored.restore(agreement));
  assert.equal(restored.snapshot(), agreement);
  until(restored, s => s.village.situations.resolved_count === 1, `${response} resolves with autonomous help`);
  const s = snapshot(restored);
  assert(s.village.situations.active.recovery >= 72);
  assert.equal(s.village.situations.active.worry, 0);
  assert(s.village.situations.active.resolved - s.village.situations.active.agreed >= 1440);
  assert.match(situationView(s.village, s.residents).markup, /A NEW RHYTHM/);
  if (output) await fs.writeFile(`${output}/solar-${response}.json`, restored.snapshot());
  console.log('PASS:', response, 'autonomous help, recovery, protection, save/reload and resolution');
  g.free(); restored.free();
}
game.free();
