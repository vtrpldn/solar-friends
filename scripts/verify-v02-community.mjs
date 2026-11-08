import assert from "node:assert/strict";
import * as THREE from "three";
import { COMMUNITY } from "../web/v02/library/community-defs.js";
import { createAsset } from "../web/v02/library/catalog.js";
import {
  createWeekend,
  chooseCamp,
  PROJECTS,
  requiredLoads,
  tick,
  save,
  restore,
} from "../web/v02/weekend/simulation.js";
for (const [id, def] of Object.entries(COMMUNITY)) {
  const model = createAsset(id),
    bounds = new THREE.Box3().setFromObject(model, true),
    size = bounds.getSize(new THREE.Vector3());
  assert(
    size.x <= def.size[0] * 2 + 0.05 && size.z <= def.size[1] * 2 + 0.05,
    `${id} fits grid`,
  );
  assert(bounds.min.y >= -0.01, `${id} grounded`);
  assert.deepEqual(PROJECTS[id].materials, def.materials);
  const s = createWeekend();
  s.arrivalElapsed = 17;
  chooseCamp(s, "clearing");
  s.projects = [];
  s.operations = [];
  s.projects.push({
    id: s.nextId++,
    key: id,
    x: 40,
    z: 39,
    work: PROJECTS[id].work,
    delivered: requiredLoads(id),
  });
  s.people.forEach((r) => {
    r.energy = 85;
    r.mealAt = 10000;
    r.drinkAt = 10000;
    r.toiletAt = 10000;
  });
  let visited = false;
  for (let n = 0; n < 600; n++) {
    tick(s, 0.1);
    if (s.people.some((r) => r.leisureKind === id)) visited = true;
  }
  assert(visited, `${id}: residents choose activity`);
  assert(
    restore(save(s)).projects.some((p) => p.key === id),
    `${id}: survives save`,
  );
  console.log(`PASS ${id}: model bounds, recipe, autonomous visit and save.`);
}
