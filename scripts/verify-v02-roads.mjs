import assert from "node:assert/strict";
import {
  createSandbox,
  plan,
  route,
  placementError,
  save,
  restore,
  PROJECTS,
  walkSegmentClear,
  crossingAt,
} from "../web/v02/weekend/simulation.js";
const s = createSandbox(42);
let site;
for (let z = 10; z < 65 && !site; z += 2)
  for (let x = 5; x < 23; x++)
    if (!placementError(s, "bridge", x, z)) {
      site = { x, z };
      break;
    }
assert.ok(site, "a bridge fits both banks");
const left = { x: site.x - 1, z: site.z + 0.5 },
  right = { x: site.x + 8, z: site.z + 0.5 };
assert.equal(
  route(s, right, left),
  null,
  "river blocks crossing before construction",
);
assert.equal(plan(s, "bridge", site.x, site.z), "");
const path = route(s, right, left);
assert.ok(path, "finished bridge connects banks");
let prior = right;
for (const step of path) {
  assert.ok(walkSegmentClear(s, prior, step));
  prior = step;
}
assert.ok(crossingAt(s, site.x + 4, site.z));
assert.ok(restore(save(s)), "bridge saves");
s.projects.at(-1).work = 0;
assert.equal(route(s, right, left), null, "unfinished bridge is not walkable");
const roads = createSandbox(42);
const pads = JSON.stringify(roads.terrainPads);
for (let x = 50; x < 57; x++) assert.equal(plan(roads, "road", x, 50), "");
assert.ok(route(roads, { x: 49, z: 50 }, { x: 57, z: 50 }));
assert.ok(restore(save(roads)));
const preferred = route(roads, { x: 49, z: 51 }, { x: 57, z: 51 });
assert.ok(
  preferred.some((p) => p.z < 50.6),
  "prefer a short detour onto the completed road",
);
assert.equal(
  JSON.stringify(roads.terrainPads),
  pads,
  "roads do not flatten land",
);
assert.ok(placementError(roads, "bridge", 60, 60), "bridge requires river");
console.log(
  "PASS: bridge spans dry banks, connects only when complete, safe crossing segments, road placement and persistence without terrain flattening.",
);
