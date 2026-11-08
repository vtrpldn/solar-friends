import assert from "node:assert/strict";
import {
  createWeekend,
  createSandbox,
  save,
  restore,
  CAMPS,
  chooseCamp,
  walkSegmentClear,
} from "../web/v02/weekend/simulation.js";
import {
  riverCenter,
  riverWidth,
  riverBankAt,
  riverAccess,
} from "../web/v02/weekend/river-layout.js";
import { MAP_HALF } from "../web/v02/weekend/map-size.js";
import { freshLandSeed,resourceRichness,depositCapacity } from "../web/v02/weekend/land-layout.js";
import { createTerrain } from "../web/v02/weekend/terrain.js";
const signatures = new Set();
for (let seed = 1; seed <= 100; seed++) {
  const s = createWeekend(seed);
  assert.equal(restore(save(s)).landSeed, seed);
  for (const camp of CAMPS)
    assert.equal(riverBankAt(camp.x, camp.z, 5, seed), false);
  for (let z = -MAP_HALF; z <= MAP_HALF; z++) {
    const x = riverCenter(z, seed),
      w = riverWidth(z, seed);
    assert.ok(x - w > -MAP_HALF && x + w < 0 && w > 1.5);
    assert.ok(riverBankAt(32 + x / 2, 32 + z / 2, 0, seed));
  }
  chooseCamp(s, "clearing");
  const access = riverAccess(seed);
  assert.equal(riverBankAt(access.x, access.z, 0.5, seed), false);
  assert.ok(walkSegmentClear(s, { x: 24, z: 32 }, access));
  signatures.add([-50, 0, 50].map((z) => riverCenter(z, seed)).join(","));
}
assert.equal(signatures.size, 100);
assert.notEqual(freshLandSeed(), freshLandSeed());
const legacy = createWeekend();
delete legacy.landSeed;
assert.equal(restore(save(legacy)).landSeed, 0);
assert.equal(createSandbox(42).landSeed, 42);
const a = createTerrain(42),
  b = createTerrain(42),
  c = createTerrain(43);
assert.deepEqual(
  a.geometry.attributes.color.array,
  b.geometry.attributes.color.array,
);
assert.notDeepEqual(
  a.geometry.attributes.color.array,
  c.geometry.attributes.color.array,
);
console.log(
  "PASS: 100 distinct seeded rivers; clear camps and water access; persistent seeds; legacy restore; deterministic terrain variation.",
);

const richness=new Set();
for(let seed=1;seed<=100;seed++)richness.add(resourceRichness(seed,40,40));
assert.equal(richness.size,100);
assert.notEqual(resourceRichness(5,0,0),resourceRichness(5,60,60));
assert.equal(depositCapacity(0,{x:0,z:0},{deposit:160,output:{stone:8}}),160);
console.log('PASS: resource richness varies across maps and regions');
