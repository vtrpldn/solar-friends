// Export the authored V2 construction data for the standalone Bevy game.
import { readFile, writeFile } from "node:fs/promises";
import { DEFAULT_SETTINGS, OPTIONS, PRESETS, applySettings } from "../web/v02/weekend/world-settings.js";
import { MATERIALS, PROCESSES, PROJECTS, createWeekend } from "../web/v02/weekend/simulation.js";
import { buildingCategory, inBuildCategory } from "../web/v02/weekend/build-categories.js";
import { productionSearchText } from "../web/v02/weekend/project-ui.js";
import { buyerFor, supplierFor } from "../web/v02/weekend/local-market.js";
import { materialMeasure, physicalUnit } from "../web/v02/weekend/material-measures.js";
import { PROFILES } from "../web/v02/weekend/resident-personality.js";
import { ANIMAL_RATIONS } from "../web/v02/weekend/animal-care.js";
import { CROPS } from "../web/v02/weekend/cultivation.js";
import { BIOLOGY, CROP_CARE } from "../web/v02/weekend/biological-production.js";
import { EQUIPMENT_IDS, RESOURCE_GROUPS, inventoryGroups } from "../web/v02/weekend/resource-groups.js";
import { supplierLimit } from "../web/v02/weekend/supplier-stock.js";

import { ECONOMY_REFERENCE, GRID_TARIFF, STARTING_CAPITAL, tripEstimate } from "../web/v02/weekend/economy-reference.js";
import { TRADE_RULES } from "../web/v02/weekend/physical-trade.js";
import { DELIVERY_LIMITS } from "../web/v02/weekend/deliveries.js";

import { encode, gallery } from "../web/v02/land/editor.js";
import { BIOMES, biomeLandscape } from "../web/v02/land/terrain.js";

import { buildingScenes, buildOptions, constructionScene, workshopModels } from "./v3-building-scene-ids.mjs";

const startingVillages = OPTIONS.supplies.map((supplies, index) =>
  applySettings(createWeekend(0xffffffff - index), { ...DEFAULT_SETTINGS, supplies }),
);
const materials = Object.fromEntries(Object.entries(MATERIALS).map(([id, material]) => [
  id,
  {
    name: material.name,
    batch: material.batch,
    pack: material.quantity || 0,
    price: Number.isFinite(material.price) ? material.price : 0,
    supplier: material.quantity ? supplierLimit(id, material) : 0,
    supplierName: material.quantity ? supplierFor(id) : "",
    unit: physicalUnit(id).unit,
    equipment: EQUIPMENT_IDS.has(id),
    mass: materialMeasure(id).kg,
    volume: materialMeasure(id).m3,
    buyer: buyerFor(id),
    starting: startingVillages.map(village => id === "wood" ? village.wood : village.materials[id]),
  },
]));

const projects = Object.fromEntries(buildOptions
  .map(([id, definition]) => [
    id,
    {
      name: definition.name,
      description: definition.description,
      searchText: `${productionSearchText(definition, PROCESSES, MATERIALS)} ${buildingCategory(definition)}`.toLowerCase(),
      model: buildingScenes.indexOf(definition.asset),
      ...(constructionScene(definition.asset, 0) ? {
        constructionModels: [0, 1].map(stage => buildingScenes.indexOf(constructionScene(definition.asset, stage))),
      } : {}),
      ...(id === "gathering" ? { unpackingModel: buildingScenes.indexOf("produce-crates") } : {}),
      kind: definition.kind,
      size: definition.size,
      materials: definition.materials,
      work: definition.work,
      category: buildingCategory(definition) ?? definition.category,
      campEssential: inBuildCategory(id, definition, "Camp essentials"),
      repeatable: Boolean(definition.repeatable),
      ...(definition.beds ? { beds: definition.beds } : {}),
    },
  ]));

// Retired in V2. Keep the existing desktop definition for saved villages and lab reports.
const emptyGoatPen = PROJECTS["goat-pasture-empty"];
projects["goat-pasture-empty"] = {
  ...projects.goat_pasture,
  name: emptyGoatPen.name,
  description: "Build the pen first. Stock it later with two goats from village supplies.",
  model: buildingScenes.indexOf(emptyGoatPen.asset),
  materials: emptyGoatPen.materials,
};

const gathering = Object.fromEntries(Object.entries(PROCESSES)
  .filter(([, recipe]) => recipe.deposit || recipe.gathering || recipe.kind === "wild-tree"));

const production = Object.fromEntries(Object.entries(PROCESSES)
  .filter(([id, recipe]) => (!BIOLOGY[id] || !["baby_greens", "vegetables", "greenhouse"].includes(id)) && !recipe.deposit && !recipe.gathering &&
    recipe.kind !== "wild-tree" && recipe.kind !== "cultivation" && (Object.keys(recipe.output).length || recipe.equipmentRepair || ["cold_storage", "solar_upgrade"].includes(id)))
  .map(([id, recipe]) => [id, {name: recipe.name, kind: recipe.kind, input: recipe.input,
    output: recipe.output, work: recipe.work, handcraft: Boolean(recipe.craft), preserved: recipe.preservedDays || {},
    ...(recipe.equipmentRepair ? {repair: recipe.equipmentRepair} : {}),
    ...(recipe.craft ? {craft: recipe.craft} : {}),
    ...(recipe.biogas ? {biogas: recipe.biogas} : {}),
    ...(recipe.kind === "kitchen" && recipe.water ? {water: recipe.water} : {}),
    ...(!BIOLOGY[id] || ["eggs", "milk"].includes(id) ? {} : {biology: {
      days: BIOLOGY[id].days, window: Number.isFinite(BIOLOGY[id].window) ? BIOLOGY[id].window : null,
      seasonal: BIOLOGY[id].seasonal, on_site_water: recipe.water || 0, planting_fraction: BIOLOGY[id].plantingFraction ?? 0.5,
      care: CROP_CARE[id] ? [CROP_CARE[id].area, CROP_CARE[id].liters] : null,
    }})}]));

for (const [kind, ration] of Object.entries(ANIMAL_RATIONS)) {
  production[ration.product].name = `Collect ${ration.product}`;
  production[`care-${kind}`] = {
    name: "Feed and water animals",
    kind,
    input: {fodder: ration.fodder},
    output: {},
    work: ration.work,
    handcraft: false,
  };
}

production["stock-goats"] = {
  name: "Stock pen with two goats",
  kind: "goat_pasture",
  input: { goats: 2 },
  output: {},
  work: ANIMAL_RATIONS.goat_pasture.work,
  handcraft: false,
};

const transport = ECONOMY_REFERENCE.transport;
const rustFloat = value => Number.isInteger(value) ? value.toFixed(1) : String(value);
const cargoLimits = rule => `(${rustFloat(rule.cargoKg)}, ${rustFloat(rule.cargoM3)})`;
const presetOptions = ["landscape", "water", "resources", "savings", "supplies", "town"];
function worldOptionIndex(settings, option) {
  const index = OPTIONS[option].indexOf(settings[option]);
  if (index < 0) throw new Error(`Invalid V2 world setting for ${option}`);
  return index;
}
const worldDefaults = ["biome", ...presetOptions].map(option => worldOptionIndex(DEFAULT_SETTINGS, option));
const worldPresets = Object.values(PRESETS).map(preset =>
  presetOptions.map(option => worldOptionIndex(preset, option)),
);
const economy = `// Generated by scripts/export-v3-catalog.mjs.
pub(crate) const WORLD_DEFAULTS: [usize; 7] = [${worldDefaults.join(", ")}];
#[rustfmt::skip]
pub(crate) const WORLD_PRESETS: [[usize; 6]; ${worldPresets.length}] = [
${worldPresets.map(preset => `    [${preset.join(", ")}],`).join("\n")}
];
pub(crate) const ROUND_TRIP_KM: [u32; 3] = [${["nearby", "drive", "remote"].map(setting => tripEstimate(setting).km).join(", ")}];
pub(crate) const STARTING_CASH: [u32; 3] = [${["tight", "modest", "comfortable"].map(setting => STARTING_CAPITAL[setting]).join(", ")}];
pub(crate) const PICKUP_CAPACITY: (f64, f64) = ${cargoLimits(TRADE_RULES)};
pub(crate) const SALE_DISPATCH_DELAY: f64 = ${rustFloat(TRADE_RULES.dispatchAfter)};
pub(crate) const FREIGHT_CAPACITY: (f64, f64) = ${cargoLimits(DELIVERY_LIMITS)};
pub(crate) const GASOLINE_REAIS_PER_LITER: f64 = ${rustFloat(transport.gasolineReaisPerLiter)};
pub(crate) const KM_PER_LITER: f64 = ${rustFloat(transport.kmPerLiter)};
pub(crate) const ROAD_KM_PER_HOUR: f64 = ${rustFloat(transport.roadKmPerHour)};
pub(crate) const HANDLING_MINUTES: f64 = ${rustFloat(transport.handlingMinutes)};
pub(crate) const GRID_CAPACITY: f64 = ${rustFloat(ECONOMY_REFERENCE.electricity.capacityKw)};
pub(crate) const GRID_TARIFF_CENTS: f64 = ${rustFloat(Math.round(GRID_TARIFF * 100))};
`;

const json = data => JSON.stringify(data, null, 2) + "\n";
const landscapes = Object.fromEntries(
  Object.keys(BIOMES).filter(id => id !== "flat").map(id => [id, biomeLandscape(id)]),
);
const exports = {
  "data/construction.json": json({ materials, resourceGroups: RESOURCE_GROUPS, foodResources: inventoryGroups("food")[0], buildOrder: buildOptions.map(([id]) => id), projects, gathering, production, residents: Object.values(PROFILES), animalRations: ANIMAL_RATIONS, workshopComparison: buildingScenes.indexOf("workshop-comparison") }),
  "data/crops.json": json(CROPS),
  "data/workshop.json": json(workshopModels),
  "data/asset-garden.json": encode(gallery()) + "\n",
  "data/asset-garden-biomes.json": JSON.stringify(landscapes) + "\n",
  "src/economy_reference.rs": economy,
};
for (const [name, serialized] of Object.entries(exports)) {
  const output = new URL(`../bevy-v3/${name}`, import.meta.url);
  if (process.argv.includes("--check")) {
    if (await readFile(output, "utf8") !== serialized) {
      console.error(`Bevy data drift in ${name}. Run node scripts/export-v3-catalog.mjs and commit the updated data.`);
      process.exitCode = 1;
    }
  } else {
    await writeFile(output, serialized);
  }
}
