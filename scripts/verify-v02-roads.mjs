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
  tick,
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
assert(roads.projects.every(p=>p.work===0), "Roads never use sandbox instant construction");
const plain = route(roads, {x:49,z:51}, {x:57,z:51});
assert(plain.every(p=>p.z===51), "Blueprints do not grant road path preference");
assert(walkSegmentClear(roads,{x:49,z:50},{x:57,z:50}), "Road plans leave the ground walkable");
const workers = new Set();
for(let i=0;i<16000 && roads.projects.some(p=>p.work<PROJECTS.road.work);i++) {
  tick(roads,.1);
  roads.people.filter(r=>r.action==='build').forEach(r=>workers.add(r.id));
}
assert(workers.size>0, "Residents physically build the road");
assert(roads.projects.every(p=>p.work===PROJECTS.road.work));
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
const storyRoad = createSandbox(42);
storyRoad.mode = 'story';
const stone = storyRoad.materials.stone, earth = storyRoad.materials.earth;
assert.equal(plan(storyRoad,'road',40,35),'');
assert.equal(storyRoad.materials.stone,stone-1);
assert.equal(storyRoad.materials.earth,earth-1);
const actions = new Set();
for(let i=0;i<12000 && storyRoad.projects[0].work<PROJECTS.road.work;i++) {
  tick(storyRoad,.1);
  storyRoad.people.filter(r=>r.job===storyRoad.projects[0].id).forEach(r=>actions.add(r.action));
}
for(const action of ['collect','carry','build']) assert(actions.has(action),action);
assert.equal(storyRoad.projects[0].delivered,2);
assert.equal(storyRoad.projects[0].work,PROJECTS.road.work);
assert(restore(save(storyRoad)));
console.log('PASS: residents deliver stone and earth, build roads in story and sandbox, and road benefits wait for completion.');
