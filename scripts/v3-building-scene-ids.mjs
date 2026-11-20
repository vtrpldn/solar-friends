import { ASSETS } from "../web/v02/library/catalog.js";
import { isBuildOption } from "../web/v02/weekend/build-categories.js";
import { PROJECTS } from "../web/v02/weekend/simulation.js";

export const buildOptions = Object.entries(PROJECTS)
  .filter(([id, project]) => isBuildOption(id, project));
const finished = [...new Set(buildOptions.map(([, project]) => project.asset))].sort();
const available = new Set(ASSETS.map(({ id }) => id));

export function constructionScene(asset, stage) {
  const id = `${asset}-construction-${stage}`;
  return available.has(id) ? id : null;
}

// Finished scenes keep their established numeric indices for the game and workshop.
export const buildingScenes = [...new Set([
  ...finished,
  ...finished.flatMap(asset => [0, 1].map(stage => constructionScene(asset, stage))).filter(Boolean),
  "produce-crates",
  "goat-pasture-empty",
  "workshop-comparison",
])];


// Append the inspection catalog without moving any gameplay scene.
const workshopOverrides = new Map([["greenhouse", "workshop-greenhouse"]]);
for (const { id } of ASSETS) {
  const scene = workshopOverrides.get(id) ?? id;
  if (!buildingScenes.includes(scene)) buildingScenes.push(scene);
}

export const workshopModels = Object.fromEntries(ASSETS.map(({ id, name, category, footprint, revision }) => [
  id,
  { name, category, size: footprint, model: buildingScenes.indexOf(workshopOverrides.get(id) ?? id), revision: revision ?? 1 },
]));
