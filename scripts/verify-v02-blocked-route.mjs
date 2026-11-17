import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWeekend, chooseCamp, route, restore, enableFastNavigation, PROJECTS} from '../web/v02/weekend/simulation.js';
import {PathQueue} from '../web/v02/weekend/path-queue.js';

function countExpansions(state, from, to) {
  let count = 0;
  const pop = PathQueue.prototype.pop;
  PathQueue.prototype.pop = function () {
    count++;
    return pop.call(this);
  };
  try {
    assert.equal(route(state, from, to), null);
    return count;
  } finally {
    PathQueue.prototype.pop = pop;
  }
}

const s = createWeekend(42);
chooseCamp(s, 'entrance');
s.projects.push({id: s.nextId++, key: 'house', x: 40, z: 10, work: PROJECTS.house.work, delivered: 0});
assert.equal(countExpansions(s, {x: 38, z: 10}, {x: 40, z: 10}), 0);
assert(route(s, {x: 38, z: 10}, {x: 38, z: 12}), 'nearby open destinations remain reachable');

const fixture = new URL('../docs/balance/evidence/2026-11-17-final-catalog-save.json', import.meta.url);
const village = restore(readFileSync(fixture, 'utf8'));
enableFastNavigation(village);
const pocket = {x: 33, z: -8};
assert(countExpansions(village, {x: 31.7, z: -17}, pocket) < 4096, 'reject the enclosed pocket before exploring the whole bank on either grid');
assert.equal(countExpansions(village, {x: 31.8, z: -17}, pocket), 0, 'reuse a closed pocket from a different starting point');
assert.deepEqual(route(village, {x: 32.99, z: -7}, pocket), [pocket], 'a resident inside the same pocket can reach it');
const courtyard = village.projects.find(p => p.key === 'home-courtyard' && p.x === 31 && p.z === -6);
assert(courtyard);
village.projects.splice(village.projects.indexOf(courtyard), 1);
assert(route(village, {x: 31.8, z: -17}, pocket), 'removing the courtyard opens the previously enclosed destination');
console.log('PASS blocked and enclosed destinations, bounded search and reachable routes');
