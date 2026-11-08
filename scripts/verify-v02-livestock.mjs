import assert from "node:assert/strict";
import {
  createWeekend,
  save,
  restore,
  MATERIALS,
  PROJECTS,
  requiredLoads,
} from "../web/v02/weekend/simulation.js";
import { createUtilitiesPreview } from "../web/v02/weekend/utilities-preview.js";
import { createAsset, disposeModel } from "../web/v02/library/catalog.js";
import { collectAnimals } from "../web/v02/library/animal-motion.js";
assert.equal(MATERIALS.goats.quantity, 2);
assert.equal(MATERIALS.hens.quantity, 3);
assert.equal(PROJECTS.goat_pasture.materials.goats, 2);
assert.equal(PROJECTS.coop.materials.hens, 3);
for (const [id, count] of [
  ["goat_pasture", 2],
  ["coop", 3],
]) {
  const model = createAsset(id);
  assert.equal(collectAnimals(model).length, count);
  disposeModel(model);
}
const old = createUtilitiesPreview(true);
delete old.livestockUnits;
old.materials.goats = 4;
old.materials.hens = 5;
for (const p of old.projects) {
  if (p.key === "goat_pasture") p.delivered--;
  if (p.key === "coop") p.delivered -= 2;
}
const converted = restore(save(old));
assert.ok(converted);
assert.equal(converted.materials.goats, 8);
assert.equal(converted.materials.hens, 15);
for (const p of converted.projects)
  assert.equal(p.delivered, requiredLoads(p.key));
const again = restore(save(converted));
assert.equal(again.materials.goats, 8);
assert.equal(again.materials.hens, 15);
assert.equal(restore(save(createWeekend())).livestockUnits, 1);
console.log(
  "PASS: individual purchase/recipe counts match visible animals; legacy saves convert once and preserve deliveries.",
);
