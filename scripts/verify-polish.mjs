import {resetMaterialLocations} from '../web/dev/material-fixture.js';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import init, { Game } from '../web/pkg/solar_friends.js';
import { placementReason, milestones } from '../web/polish.js';
await init({ module_or_path: await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm', import.meta.url)) });
const game = new Game();
const fixture = JSON.parse(game.snapshot());
fixture.village.progress.completed = [true, true, true, true];
fixture.village.progress.later_completed.fill(true);
fixture.village.wood = 100;
assert.equal(game.restore(JSON.stringify(resetMaterialLocations(fixture))), true);
assert.equal(game.place('home', 8, 8), 'ok');
assert.equal(game.place('square', 16, 16), 'ok');
const base = game.snapshot(), village = JSON.parse(base).village;
let checks = 0;
for (const [kind, price] of Object.entries({solar_farm:48, streetlight:6, road: 0, home: 32, garden: 12, greenhouse: 60, square: 36, well: 18})) {
  for (let x = 0; x < 28; x++) for (let y = 0; y < 28; y++) {
    assert.equal(game.restore(base), true);
    const expected = kind === 'road' ? game.toggle_road(x,y) : game.place(kind,x,y);
    assert.equal(placementReason(village, kind, x, y, price) === '', expected === 'ok', `${kind} at ${x},${y}: ${expected}`);
    checks++;
  }
}
const poor = structuredClone(village); poor.wood = 0;
assert.equal(placementReason(poor,'home',20,8,32),'');
assert.deepEqual(milestones(null, village), []);
assert.deepEqual(milestones(village, structuredClone(village)), []);
const next = structuredClone(village); next.buildings[0].progress = 100; next.harvests++;
next.progress.friendships[0] = {1:1};
assert.deepEqual(milestones(village,next).map(e => e.kind), ['building','harvest','friendship']);
const questBefore = structuredClone(village); questBefore.progress.completed[0] = false;
assert.equal(milestones(questBefore,village).find(e => e.kind === 'quest').quest, 0);
game.free();
console.log(`${checks} placement previews agree with Rust; resource shortages and milestone transitions passed.`);
