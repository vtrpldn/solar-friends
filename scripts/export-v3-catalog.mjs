// Export the authored V2 construction data for the standalone Bevy game.
import { writeFile } from "node:fs/promises";
import { MATERIALS, PROJECTS, PROCESSES, createWeekend } from "../web/v02/weekend/simulation.js";
import { buildingCategory, inBuildCategory, isBuildOption } from "../web/v02/weekend/build-categories.js";
import { materialMeasure } from "../web/v02/weekend/material-measures.js";
import { BIOLOGY } from "../web/v02/weekend/biological-production.js";
import { supplierLimit } from "../web/v02/weekend/supplier-stock.js";

const startingVillage = createWeekend();
const materials = Object.fromEntries(Object.entries(MATERIALS).map(([id, material]) => [
  id,
  {
    name: material.name,
    batch: material.batch,
    pack: material.quantity || 0,
    price: Number.isFinite(material.price) ? material.price : 0,
    supplier: material.quantity ? supplierLimit(id, material) : 0,
    mass: materialMeasure(id).kg,
    volume: materialMeasure(id).m3,
    starting: id === "wood" ? startingVillage.wood : startingVillage.materials[id],
  },
]));

const options = Object.entries(PROJECTS).filter(([id, definition]) => isBuildOption(id, definition));
const models = [...new Set(options.map(([, definition]) => definition.asset))].sort();
const projects = Object.fromEntries(options
  .map(([id, definition]) => [
    id,
    {
      name: definition.name,
      model: models.indexOf(definition.asset),
      kind: definition.kind,
      size: definition.size,
      materials: definition.materials,
      work: definition.work,
      category: buildingCategory(definition) ?? definition.category,
      campEssential: inBuildCategory(id, definition, "Camp essentials"),
      repeatable: Boolean(definition.repeatable),
    },
  ]));

const gathering = Object.fromEntries(Object.entries(PROCESSES)
  .filter(([, recipe]) => recipe.deposit || recipe.gathering || recipe.kind === "wild-tree"));

const production = Object.fromEntries(Object.entries(PROCESSES)
  .filter(([id, recipe]) => !BIOLOGY[id] && !recipe.deposit && !recipe.gathering &&
    recipe.kind !== "wild-tree" && recipe.kind !== "cultivation" && Object.keys(recipe.output).length)
  .map(([id, recipe]) => [id, {name: recipe.name, kind: recipe.kind, input: recipe.input,
    output: recipe.output, work: recipe.work, handcraft: Boolean(recipe.craft)}]));

await writeFile(new URL("../bevy-v3/data/construction.json", import.meta.url),
  JSON.stringify({ materials, projects, gathering, production }, null, 2) + "\n");
