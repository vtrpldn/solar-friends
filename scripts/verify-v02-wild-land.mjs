// The per-tick loops skip wild trees (web/v02/weekend/wild-land.js). Skipping must never change
// a village: every scenario here is played twice, shortcuts on and off, and the saves must match.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROJECTS, enableFastNavigation, plan, placementError, queueProduction, removeProject, restore, save, tick} from '../web/v02/weekend/simulation.js';
import {setWildShortcuts, landIndex, WILD_KIND} from '../web/v02/weekend/wild-land.js';
import {village, DAY} from './fixtures.mjs';

const isTree = p => PROJECTS[p.key].kind === WILD_KIND;
// Things that change the project and node lists while the shortcuts hold their caches.
function disturb(s, step, did) {
  if (step === 300) {
    const tree = s.projects.find(p => isTree(p) && !p.felled);
    did.fell = !!tree && queueProduction(s, tree.id, 'fell_tree') === '';
  }
  if (step === 600) {
    for (let z = s.stock.z - 8, placed = false; !placed && z <= s.stock.z + 8; z++)
      for (let x = s.stock.x - 8; x <= s.stock.x + 8; x++)
        if (!placementError(s, 'gathering', x, z)) { plan(s, 'gathering', x, z); placed = true; break; }
  }
  if (step === 1500) {
    did.demolish = s.projects.some(p => !p.natural && p.work >= PROJECTS[p.key].work && removeProject(s, p.id, 'demolish') === '');
  }
}
const SCENARIOS = {
  'new village': () => village().s,
  'built village': () => village({money: 50000, materials: {food: 60, fodder: 40}, buildings: ['kitchen', 'well', 'garden', 'solar_farm', 'coop', 'wetland', 'water-pump', 'workshop', 'shed', 'eco_toilet', 'rain-barrel', 'greenhouse']}).s,
  'day-100 save': () => { const s = restore(readFileSync(new URL('../docs/balance/evidence/2026-11-17-integrated-day-100-save.json', import.meta.url), 'utf8')); enableFastNavigation(s); return s; },
};
function play(build, shortcuts) {
  setWildShortcuts(shortcuts);
  try {
    const s = build(), saves = [], did = {};
    for (let step = 0; step < 1.5 * DAY; step++) {
      disturb(s, step, did);
      tick(s, 1);
      if (step % 400 === 399) saves.push(save(s));
    }
    return {s, saves, did};
  } finally { setWildShortcuts(true); }
}
for (const [name, build] of Object.entries(SCENARIOS)) {
  const fast = play(build, true), plain = play(build, false);
  fast.saves.forEach((text, i) => assert.equal(text, plain.saves[i], `${name}: the village differs with the wild-tree shortcuts by tick ${(i + 1) * 400}`));
  const trees = fast.s.projects.filter(isTree);
  // What the shortcuts rely on: nothing tends a tree, and its utility node stays empty.
  for (const p of trees) {
    assert.deepEqual(['cultivation', 'animalCare', 'solarUpgrade', 'condition', 'soilFertility', 'coldStorage', 'batteryAgeDays'].filter(k => p[k] !== undefined), [], `${name}: a wild tree gained state the shortcuts skip`);
    assert(!(p.billOfMaterials?.batteries || p.billOfMaterials?.panels), `${name}: a wild tree has power equipment`);
    const node = fast.s.infrastructure.nodes[p.id];
    assert(node.enabled === true && !node.battery && !node.charge && node.capacity.every(n => n === 0) && !node.maintainFresh && !node.maintainSanitation, `${name}: a wild tree's utility node is not empty`);
  }
  if (name === 'built village') assert(fast.did.demolish, 'a building was queued for demolition');
  if (name === 'new village') {
    assert(trees.length > 100, 'a new plot is mostly wild trees');
    assert(trees.some(p => p.felled), 'the queued tree was felled');
    assert.equal(landIndex(fast.s, PROJECTS).tended.length, fast.s.projects.length - trees.length);
  }
}
console.log('Wild-tree shortcuts leave every scenario unchanged.');
