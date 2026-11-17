import assert from "node:assert/strict";
import * as THREE from "three";
import { ASSETS, createAsset } from "../web/v02/library/catalog.js";
import {FUNCTIONAL_LAYOUTS} from '../web/v02/library/functional-layouts.js';
import {FUNCTIONAL_PROGRAM} from '../web/v02/library/functional-program.js';
import {REMODELED_FACILITIES} from '../web/v02/library/functional-facilities.js';
// Budgets follow visual role: tile roofs need geometry; tiny crop leaves do not.
const budgets = {
  Props: 1200,
  "Resource icons": 800,
  Construction: 5000,
  Homes: 5000,
  Buildings: 5000,
  Vegetation: 3000,
  Animals: 800,
  Residents: 800,
  Supplies: 2000,
  Crops: 300,
  Geology: 500,
  Terrain: 250,
};
const rows = [];
for (const asset of ASSETS) {
  const model = createAsset(asset.id),
    bounds = new THREE.Box3().setFromObject(model, true),
    size = bounds.getSize(new THREE.Vector3());
  let triangles = 0;
  model.traverse((o) => {
    if (o.isMesh)
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  // Roof detail scales with floor area: compare larger homes at the same tile density.
  // The two-bay kitchen and roofed picnic shelter have architectural roof budgets.
  const functional=FUNCTIONAL_LAYOUTS[asset.id]||REMODELED_FACILITIES.has(asset.id);
  const shell=FUNCTIONAL_PROGRAM[asset.id]?.shell;
  // Fixed roof tile density requires a budget per square metre, not per
  // reserved cell (which includes yards). Crops/trees have per-plant budgets.
  const budget=functional && shell ? Math.max(5000,shell[0]*shell[1]*450+2000)
    : ['garden','greenhouse'].includes(asset.id)?8000
    : ['orchard','supply-0'].includes(asset.id)?12000
    : ['grove','banana_treatment'].includes(asset.id)?8000
    : asset.id==='picnic-table'?5000:budgets[asset.category];
  assert(triangles<=budget,`${asset.id}: ${triangles} triangles exceeds budget ${budget}`);
  assert(bounds.min.y >= -0.001, `${asset.id}: below ground`);
  // Roofs and tree crowns may overhang a footprint; foundations are separately tested.
  const allowance = asset.category === "Vegetation" ? 1.5 : 1.25;
  assert(
    size.x <= asset.footprint[0] * 2 * allowance &&
      size.z <= asset.footprint[1] * 2 * allowance,
    `${asset.id}: excessive footprint overhang`,
  );
  if (asset.category === "Residents")
    assert(size.y >= 1.7 && size.y <= 1.95, asset.id);
  if (asset.category === "Homes")
    assert(size.y >= 3.7 && size.y <= 5, asset.id);
  rows.push({
    id: asset.id,
    category: asset.category,
    dimensions: size.toArray().map((n) => +n.toFixed(3)),
    triangles,
  });
}
// Assembly frames should not become unrelated, taller structures (for example,
// a house roof over a pump or sports court).
for (const frame of rows.filter((a) => a.id.endsWith("-construction-1"))) {
  const finished = rows.find((a) => a.id === frame.id.replace("-construction-1", ""));
  assert(finished, `${frame.id}: missing completed model`);
  // Survey stakes intentionally stand above the flat road surface.
  if (finished.category === "Terrain") continue;
  assert(frame.dimensions[1] <= finished.dimensions[1] + 0.25,
    `${frame.id}: assembly silhouette exceeds completed building height`);
}
for (const crop of [
  "lettuce",
  "beans",
  "tomato",
  "maize",
  "cassava",
  "fodder",
]) {
  const heights = [0, 1, 2].map(
    (stage) => rows.find((a) => a.id === `${crop}-${stage}`).dimensions[1],
  );
  assert(
    heights[0] < heights[1] && heights[1] < heights[2],
    `${crop}: growth order`,
  );
}
const standardHomes = rows
  .filter((a) => a.category === "Homes" && FUNCTIONAL_LAYOUTS[a.id]?.occupants === 2)
  .map((a) => {const l=FUNCTIONAL_LAYOUTS[a.id];return a.triangles/(l.shell[0]*(l.shell[1]+(l.verandaDepth||0)));});
assert(Math.max(...standardHomes) / Math.min(...standardHomes) < 1.2, "Standard house detail drift");
const homes = rows
  .filter((a) => a.category === "Homes")
  .map((a) => {
    const asset = ASSETS.find((asset) => asset.id === a.id);
    const shell=FUNCTIONAL_LAYOUTS[a.id].shell;
    return a.triangles / (shell[0] * (shell[1]+(FUNCTIONAL_LAYOUTS[a.id].verandaDepth||0)));
  });
assert(Math.max(...homes) / Math.min(...homes) < 1.25, "House detail density drift");
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else
  console.log(
    `PASS: ${rows.length} models; category triangle budgets, footprint overhang, grounded origins, resident/house scale, crop growth, and house detail consistency.`,
  );
