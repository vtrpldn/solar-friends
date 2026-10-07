import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import init, { Game } from '../web/pkg/solar_friends.js';
import { flock, chickenFrame } from '../web/chickens.js';
await init({module_or_path: await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm', import.meta.url))});
const game = new Game();
const snapshot = () => JSON.parse(game.snapshot());
for (let i = 0; i < 100; i++) game.tick(.25);
const timber = snapshot().village.wood;
assert.equal(game.place('coop', 12, 10), 'ok');
assert.equal(snapshot().village.wood, timber - 24);
assert.equal(flock(snapshot().village).length, 0);
assert.notEqual(game.place('coop', 12, 10), 'ok');
assert.equal(snapshot().village.wood, timber - 24);
for (let i = 0; i < 10000 && snapshot().village.buildings[0].progress < 100; i++) game.tick(.25);
const saved = snapshot();
assert.equal(saved.village.buildings[0].progress, 100);
assert.equal(flock(saved.village).length, 3);
const restored = new Game();
assert.equal(restored.restore(JSON.stringify(saved)), true);
assert.deepEqual(flock(JSON.parse(restored.snapshot()).village), flock(saved.village));
const night = {...saved.village, minutes: 1200};
assert.equal(flock(night).length, 0);
assert.equal(flock({...night, minutes: 1440 + 420}).length, 3);
assert.notDeepEqual(flock({...night, minutes: 600}), flock({...night, minutes: 620}));
const two = {...saved.village, buildings: [...saved.village.buildings, {...saved.village.buildings[0], id: 1, x: 18}]};
assert.equal(flock(two).length, 6);
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(saved));
console.log('PASS: cost, collision, autonomous construction, three hens per coop, night roosting, movement, and save/reload');

assert.deepEqual(flock(saved.village).map(hen => hen.variant), [0, 1, 2]);
for (let variant = 0; variant < 3; variant++) {
  const standing = chickenFrame({variant, peck: 0});
  const pecking = chickenFrame({variant, peck: 3});
  assert.equal(standing.column, variant);
  assert.equal(pecking.column, variant);
  assert.equal(standing.row, 0);
  assert.equal(pecking.row, 1);
  assert.equal(478 - standing.anchor * 512, 0, 'Standing feet must meet the ground');
  assert.equal([406,404,406][variant] - pecking.anchor * 512, 0, 'Pecking feet must meet the ground');
}
const preview = new Game();
assert(preview.restore(await fs.readFile(new URL('../web/artwork/village-preview.json', import.meta.url), 'utf8')));
const previewVillage = JSON.parse(preview.snapshot()).village;
assert.deepEqual([...new Set(previewVillage.buildings.map(b => b.kind))].sort(),
  ['home','kitchen','garden','well','grove','compost','square','workshop','coop'].sort());
assert(previewVillage.buildings.every(b => b.progress >= 100));
assert.equal(flock(previewVillage).length, 3);
console.log('PASS: painted hen variants, pose foot anchors, and complete in-game artwork preview');
