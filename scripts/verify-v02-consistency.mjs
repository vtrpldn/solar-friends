import assert from "node:assert/strict";
import * as THREE from "three";
import { ASSETS, createAsset } from "../web/v02/library/catalog.js";
// Budgets follow visual role: tile roofs need geometry; tiny crop leaves do not.
const budgets = {
  Props: 1200,
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
  assert(
    triangles <= budgets[asset.category],
    `${asset.id}: ${triangles} triangles exceeds category budget`,
  );
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
    assert(size.y >= 3.7 && size.y <= 4.2, asset.id);
  rows.push({
    id: asset.id,
    category: asset.category,
    dimensions: size.toArray().map((n) => +n.toFixed(3)),
    triangles,
  });
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
const homes = rows
  .filter((a) => a.category === "Homes")
  .map((a) => a.triangles);
assert(Math.max(...homes) / Math.min(...homes) < 1.2, "House detail drift");
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else
  console.log(
    `PASS: ${rows.length} models; category triangle budgets, footprint overhang, grounded origins, resident/house scale, crop growth, and house detail consistency.`,
  );
