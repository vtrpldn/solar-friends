import assert from "node:assert/strict";
import {
  ASSETS,
  createAsset,
  compactModel,
  disposeModel,
} from "../web/v02/library/catalog.js";
import {
  prepareHouseLighting,
  updateHouseLighting,
} from "../web/v02/weekend/house-lighting.js";
for (const def of ASSETS.filter((a) => a.category === "Homes")) {
  const model = compactModel(createAsset(def.id)),
    lighting = prepareHouseLighting(model);
  assert.ok(
    lighting.panes.length >= 1,
    def.id + " has illuminated window panes",
  );
  const other = compactModel(createAsset(def.id)),
    unlit = prepareHouseLighting(other);
  updateHouseLighting(lighting, 1);
  assert.ok(lighting.panes.every((p) => p.material.emissiveIntensity === 0.85));
  assert.ok(
    unlit.panes.every(
      (p) =>
        p.material.emissiveIntensity === 1 &&
        p.material.emissive.getHex() === 0,
    ),
    "instances retain separate materials",
  );
  updateHouseLighting(lighting, 0);
  assert.ok(
    lighting.panes.every(
      (p) =>
        p.material.emissiveIntensity === 0 && p.material.color.equals(p.color),
    ),
  );
  disposeModel(model);
  disposeModel(other);
}
console.log(
  "PASS: all house variants have isolated window glow and restore their daytime materials when unlit.",
);
