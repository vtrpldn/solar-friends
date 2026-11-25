import {HOME_DESIGNS} from '../web/v02/library/home-designs.js';
import assert from "node:assert/strict";
import {
  createSandbox,
  plan,
  moveProject,
  tick,
  enableFastNavigation,
  footprint,
  buildingFront,
  save,
  restore,
  PROJECTS,
  placementError,
} from "../web/v02/weekend/simulation.js";
import { footprintRelief } from "../web/v02/weekend/elevation.js";
for (const key of ["workshop","home-cottage","home-longhouse",...HOME_DESIGNS.map(d=>d.id)]) for (let rotation = 0; rotation < 4; rotation++) {
  const s = createSandbox(42);
  // Bare land: this fixture places buildings at fixed cells, before any grove could grow there.
  s.naturalLandVersion = s.gatheringLandVersion = 1;
  assert.equal(plan(s, key, 60, 50, rotation), "");
  const p = s.projects.at(-1);
  assert.deepEqual(footprint(p), rotation % 2 ? [...PROJECTS[key].size].reverse() : PROJECTS[key].size);
  assert.equal(restore(save(s)).projects.at(-1).rotation, rotation);
  const [w, d] = footprint(p);
  assert.ok(footprintRelief(60, 50, w, d, 42, s.terrainPads) < 1e-8);
  const front = buildingFront(p);
  assert.ok(
    rotation === 0
      ? front.z >= 50 + d
      : rotation === 1
        ? front.x >= 60 + w
        : rotation === 2
          ? front.z < 50
          : front.x < 60,
  );
  assert.ok(placementError(s, "garden", 60, 50));
  assert.equal(moveProject(s, p.id, 65, 55, (rotation + 1) % 4), "");
  assert.equal(p.rotation,rotation,'relocation waits for resident work');
  assert.equal(p.removal.target.rotation,(rotation+1)%4);
  // Execute one physical relocation here; all catalog/rotation combinations
  // validate the reserved destination and its serialized rotation above.
  if(key==='workshop'&&rotation===0){
    enableFastNavigation(s);
    for(let i=0;i<64000&&p.removal;i++)tick(s,.1);
    assert.equal(p.removal, undefined, "residents finish relocation");
    assert.equal(p.rotation, (rotation + 1) % 4);
  }
  assert.ok(restore(save(s)));
}
const s = createSandbox();
assert.ok(plan(s, "workshop", 60, 50, 4));
assert.equal(s.projects.length, 0);
console.log(
  "PASS: all four rotations, swapped rectangular bounds, collision, grading, entrances, move and save restoration.",
);
