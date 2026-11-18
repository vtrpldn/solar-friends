// Export the authored V2 construction data for the standalone Bevy game.
import { writeFile } from "node:fs/promises";
import { MATERIALS, PROJECTS, createWeekend } from "../web/v02/weekend/simulation.js";
import { buildingCategory, inBuildCategory, isBuildOption } from "../web/v02/weekend/build-categories.js";

const startingVillage = createWeekend();
const materials = Object.fromEntries(Object.entries(MATERIALS).map(([id, material]) => [
  id,
  {
    name: material.name,
    batch: material.batch,
    starting: id === "wood" ? startingVillage.wood : startingVillage.materials[id],
  },
]));

const projects = Object.fromEntries(Object.entries(PROJECTS)
  .filter(([id, definition]) => isBuildOption(id, definition))
  .map(([id, definition]) => [
    id,
    {
      name: definition.name,
      size: definition.size,
      materials: definition.materials,
      work: definition.work,
      category: buildingCategory(definition) ?? definition.category,
      campEssential: inBuildCategory(id, definition, "Camp essentials"),
      repeatable: Boolean(definition.repeatable),
    },
  ]));

await writeFile(new URL("../bevy-v3/data/construction.json", import.meta.url),
  JSON.stringify({ materials, projects }, null, 2) + "\n");
