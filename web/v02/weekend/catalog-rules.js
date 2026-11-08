import { COMMUNITY } from "../library/community-defs.js";
import { BUILDING_MODELS } from "./building-models.js";
// v1 economy.rs construction recipes, expressed in v2 material IDs.
const recipes = {
  'groundwater-well':{stone:18,wood:8,hardware:4,plumbing:2,tiles:4},
  'water-pump':{stone:4,pumps:1,plumbing:4,electrical:2,hardware:2},
  road: { stone: 1, earth: 1 },
  bridge: { wood: 32, hardware: 8, stone: 8 },
  home: {
    earth: 6,
    stone: 4,
    frames: 4,
    walls: 6,
    tiles: 6,
    hardware: 2,
    panels: 1,
    batteries: 1,
    electrical: 1,
  },
  adobe: {
    earth: 22,
    stone: 4,
    bamboo: 8,
    hardware: 4,
    tiles: 6,
    panels: 1,
    batteries: 1,
    electrical: 1,
  },
  shed: { wood: 8, hardware: 1, tiles: 6 },
  garden: { earth: 4, wood: 4, seedlings: 2 },
  greenhouse: {
    stone: 4,
    earth: 2,
    frames: 4,
    hardware: 2,
    covering: 1,
    plumbing: 2,
    seedlings: 2,
  },
  well: { stone: 6, earth: 2, plumbing: 4, hardware: 2, pumps: 1, tank: 1 },
  kitchen: {
    earth: 4,
    stone: 4,
    frames: 4,
    walls: 4,
    tiles: 4,
    plumbing: 2,
    hardware: 2,
  },
  grove: { earth: 6, wood: 2, tree_starts: 2 },
  compost: { earth: 2, wood: 4, hardware: 1 },
  square: { stone: 10, earth: 4, frames: 4, wood: 4, hardware: 2 },
  workshop: {
    stone: 6,
    earth: 4,
    frames: 6,
    walls: 4,
    tiles: 4,
    wood: 6,
    hardware: 3,
  },
  orchard: { earth: 8, compost: 2, tree_starts: 4 },
  goat_pasture: { bamboo: 10, tiles: 3, hardware: 2, plumbing: 1, goats: 2 },
  apiary: { wood: 3, tiles: 1, hardware: 1, bees: 1 },
  coop: { stone: 2, frames: 2, tiles: 2, hardware: 1, hens: 3 },
  solar_farm: { stone: 6, hardware: 3, panels: 2, batteries: 1, electrical: 2 },
  streetlight: { stone: 1, wood: 2, electrical: 1, hardware: 1 },
  hydro: {
    stone: 6,
    bamboo: 4,
    hardware: 4,
    electrical: 2,
    pumps: 1,
    batteries: 1,
  },
  eco_toilet: {
    stone: 4,
    earth: 6,
    bamboo: 6,
    tiles: 3,
    plumbing: 2,
    hardware: 2,
  },
  wetland: { stone: 8, earth: 4, covering: 1, plumbing: 3, hardware: 2 },
  banana_treatment: {
    stone: 8,
    earth: 8,
    walls: 6,
    plumbing: 3,
    hardware: 2,
    tree_starts: 2,
  },
  biodigester: { stone: 4, walls: 6, plumbing: 5, hardware: 3, tiles: 2 },
  warehouse: {
    stone: 8,
    earth: 28,
    bamboo: 12,
    hardware: 5,
    tiles: 10,
    frames: 2,
  },
};
const extraMaterials = {
  bamboo: ["Bamboo poles", 4, 12, 48],
  earth: ["Building earth", 4, 12, 18],
  stone: ["Stone", 4, 12, 42],
  frames: ["Frames", 2, 4, 72],
  walls: ["Wall material", 4, 8, 40],
  tiles: ["Roof tiles", 4, 12, 108],
  electrical: ["Electrical supplies", 1, 4, 144],
  covering: ["Greenhouse covering", 1, 1, 80],
  panels: ["Solar panels", 1, 2, 560],
  batteries: ["Battery equipment", 1, 1, 420],
  pumps: ["Pumps", 1, 1, 160],
  tools: ["Tool supplies", 1, 4, 36],
  food: ["Ingredients", 4, 12, 48],
  meals: ["Prepared meals", 4, 12, 96],
  eggs: ["Eggs", 4, 12, 36],
  compost: ["Mature compost", 4, 8, 64],
  scraps: ["Organic residues", 4, 0, 0],
  seedlings: ["Vegetable seedlings", 4, 8, 24],
  tree_starts: ["Timber seedlings", 2, 4, 40],
  bamboo_starts: ["Bamboo starts", 2, 4, 80],
  fodder: ["Dry fodder", 4, 12, 24],
  milk: ["Fresh milk", 4, 6, 42],
  honey: ["Honey", 4, 4, 48],
  goats: ["Goats", 1, 2, 1800],
  bees: ["Bee colonies", 1, 1, 400],
  hens: ["Hens", 1, 3, 180],
};
export function expandMaterials(materials) {
  for (const [id, [name, batch, quantity, price]] of Object.entries(
    extraMaterials,
  ))
    materials[id] = { name, batch, quantity, price };
}
export function expandProjects(projects) {
  for (const model of BUILDING_MODELS) {
    let kind = model.category === "Homes" ? "home" : model.id;
    if (kind === "goat-pasture-empty") kind = "goat_pasture";
    let materials = {
      ...(COMMUNITY[model.id]?.materials ||
        recipes[model.id.startsWith("adobe") ? "adobe" : kind] || {
          wood: 4,
          hardware: 1,
        }),
    };
    if (model.id === 'home-shared') materials={...recipes.adobe};
    if (model.category === 'Homes' && model.size[0]>2) {
      const factor=model.size[0]/2;
      materials=Object.fromEntries(Object.entries(materials).map(([id,n])=>[id,Math.ceil(n*factor)]));
    }
    if (model.id === "goat-pasture-empty") delete materials.goats;
    const sources = {
      "supply-0": { tree_starts: 4 },
      "supply-1": { bamboo_starts: 4 },
      "supply-2": { tools: 1 },
      "supply-3": { tools: 1 },
      "supply-5": { wood: 4 },
      "supply-6": { batteries: 1, electrical: 1 },
    };
    if (sources[model.id]) materials = sources[model.id];
    if (model.id === "rain-barrel") materials = { tank: 1, plumbing: 1 };
    if (model.id === "wash-station") materials = { wood: 4, plumbing: 1 };
    if (model.id.startsWith("canvas-tent")) materials = { tarp: 1, wood: 2 };
    const category =
      model.category === "Homes"
        ? "Homes"
        : model.category === "Supplies" && model.id !== "supply-6"
          ? "Resources"
          : ["solar_farm", "hydro", "streetlight", "supply-6"].includes(
                model.id,
              )
            ? "Power"
            : [
                  "well", "groundwater-well", "water-pump",
                  "rain-barrel",
                  "wash-station",
                  "eco_toilet",
                  "wetland",
                  "biodigester",
                  "banana_treatment",
                ].includes(kind)
              ? "Water"
              : [
                    "garden",
                    "grove",
                    "greenhouse",
                    "orchard",
                    "coop",
                    "apiary",
                    "goat_pasture",
                    "compost",
                  ].includes(kind)
                ? "Food & land"
                : model.category === "Props"
                  ? "Camp"
                  : "Buildings";
    projects[model.id] = {
      name: model.name,
      asset: model.id,
      size: model.size,
      beds: model.beds,
      materials,
      work:
        kind === "road"
          ? 20
          : Math.max(
              90,
              Object.values(materials).reduce((a, b) => a + b, 0) * 22,
            ),
      kind,
      category: ["road", "bridge"].includes(kind)
        ? "Roads & bridges"
        : COMMUNITY[model.id]?.category || category,
      repeatable: true,
      description:
        ({'groundwater-well':'A covered groundwater well. Recharges up to 8 untreated water per hour (less in dry conditions), storing 40. Residents can carry it to a cistern for filtering; no electricity needed.',
          'water-pump':'An electric intake beside a river or within 6 cells of a completed water well. Draws up to 24 untreated water per hour and feeds cisterns and irrigation. Requires power; well recharge can limit supply.'}[model.id]) ||
        COMMUNITY[model.id]?.description ||
        `${model.name}. ${model.size.join(" × ")} cells. Build with physical supplies and resident labor.`,
    };
  }
  for (const key of ["gathering", "water", "shelter", "toilet"]) {
    projects[key].size = BUILDING_MODELS.find(
      (m) => m.id === projects[key].asset,
    ).size;
    projects[key].category = "First camp";
    projects[key].kind = {
      water: "well",
      shelter: "shed",
      toilet: "eco_toilet",
      gathering: "square",
    }[key];
  }
}
export const PROCESSES = {
  frames: {
    name: "Prepare frames",
    input: { wood: 2, hardware: 1 },
    output: { frames: 1 },
    kind: "workshop",
    work: 30,
  },
  walls: {
    name: "Make earth walls",
    input: { earth: 2 },
    output: { walls: 2 },
    kind: "workshop",
    work: 30,
  },
  tiles: {
    name: "Fire roof tiles",
    input: { earth: 2, wood: 1 },
    output: { tiles: 2 },
    kind: "workshop",
    work: 40,
  },
  meals: {
    name: "Cook a meal batch",
    input: { food: 4 },
    output: { meals: 4, scraps: 1 },
    kind: "kitchen",
    work: 25,
    water: 2,
  },
  compost: {
    name: "Turn compost",
    input: { scraps: 4 },
    output: { compost: 2 },
    kind: "compost",
    work: 40,
  },
  wood: {
    name: "Harvest and replant timber",
    input: {},
    output: { wood: 12 },
    kind: "supply-0",
    work: 60,
    renew: 600,
  },
  bamboo: {
    name: "Cut mature bamboo",
    input: {},
    output: { bamboo: 12 },
    kind: "supply-1",
    work: 50,
    renew: 450,
  },
  earth: {
    name: "Extract building earth",
    input: {},
    output: { earth: 12 },
    kind: "supply-2",
    work: 40,
    deposit: 240,
  },
  stone: {
    name: "Extract stone",
    input: {},
    output: { stone: 8 },
    kind: "supply-3",
    work: 50,
    deposit: 160,
  },
  vegetables: {
    name: "Plant and harvest vegetables",
    input: { seedlings: 2 },
    output: { food: 12, scraps: 2 },
    kind: "garden",
    work: 60,
    water: 6,
    renew: 180,
  },
  greenhouse: {
    name: "Grow greenhouse vegetables",
    input: { seedlings: 2 },
    output: { food: 16, scraps: 2 },
    kind: "greenhouse",
    work: 60,
    water: 6,
    renew: 150,
  },
  fruit: {
    name: "Harvest orchard fruit",
    input: {},
    output: { food: 12, scraps: 2 },
    kind: "orchard",
    work: 35,
    water: 4,
    renew: 300,
  },
  bananas: {
    name: "Harvest bananas",
    input: {},
    output: { food: 12, scraps: 2 },
    kind: "grove",
    work: 35,
    water: 4,
    renew: 300,
  },
  eggs: {
    name: "Feed hens and collect eggs",
    input: { fodder: 2 },
    output: { eggs: 6 },
    kind: "coop",
    work: 25,
    water: 2,
    renew: 120,
  },
  milk: {
    name: "Feed and milk goats",
    input: { fodder: 3 },
    output: { milk: 4 },
    kind: "goat_pasture",
    work: 35,
    water: 3,
    renew: 120,
  },
  honey: {
    name: "Tend hives and collect honey",
    input: {},
    output: { honey: 3 },
    kind: "apiary",
    work: 25,
    renew: 240,
  },
};
