import assert from "node:assert/strict";
import { ASSETS } from "../web/v02/library/catalog.js";
import {
  PROJECTS,
  MATERIALS,
  createWeekend,
  chooseCamp,
  plan,
  tick,
  requiredLoads,
  placementError,
  queueProduction,
  queueWater,
  connectUtility,
  save,
  restore,
  sellMaterial,
  storedMaterials,
  storageCapacity,
} from "../web/v02/weekend/simulation.js";
import {
  syncInfrastructure,
  infrastructureStep,
  transferWater,
  useWater,
  validInfrastructure,
} from "../web/v02/weekend/infrastructure.js";
const run = (s, seconds) => {
  for (let i = 0; i < seconds * 10; i++) tick(s, 0.1);
};
const fresh = () => {
  const s = createWeekend();
  s.arrivalElapsed = 17;
  chooseCamp(s, "clearing");
  for (const id of Object.keys(MATERIALS))
    if (id !== "wood") s.materials[id] = 500;
  s.wood = 500;
  return s;
};
const built = (s, key, x, z) => {
  const p = {
    id: s.nextId++,
    key,
    x,
    z,
    work: PROJECTS[key].work,
    delivered: requiredLoads(key),
  };
  s.projects.push(p);
  syncInfrastructure(s, PROJECTS);
  return p;
};
const buildingModels = ASSETS.filter((a) =>
  ["Homes", "Buildings"].includes(a.category),
);
for (const a of buildingModels) {
  const def = Object.values(PROJECTS).find((d) => d.asset === a.id);
  assert(def, `${a.id} missing`);
  assert.deepEqual(def.size, a.footprint);
}
for (const def of Object.values(PROJECTS))
  for (const id of Object.keys(def.materials)) assert(MATERIALS[id]);
const layout = fresh();
assert.equal(plan(layout, "solar_farm", 40, 40), "");
assert.equal(plan(layout, "solar_farm", 44, 40), "");
assert.match(placementError(layout, "streetlight", 42, 40), /occupies/);
assert.equal(placementError(layout, "streetlight", 43, 43), "");
assert(restore(save(layout)));
let hydroPlace = null;
for (let x = 18; x < 24; x++)
  for (let z = 30; z < 45; z++)
    if (!placementError(layout, "hydro", x, z)) hydroPlace = { x, z };
assert(hydroPlace, "Hydro has reachable riverbank sites");
console.log(
  `PASS: all ${buildingModels.length} building models, correct footprints, repeated construction, save and river generator placement.`,
);
const power = fresh(),
  solar = built(power, "solar_farm", 40, 40),
  lamp = built(power, "streetlight", 44, 40);
let sys = syncInfrastructure(power, PROJECTS);
power.time = 1200;
infrastructureStep(power, PROJECTS, 1);
assert.equal(
  sys.nodes[lamp.id].power,
  0,
  "Disconnected streetlight has no power at night",
);
assert.equal(connectUtility(power, "power", solar.id, lamp.id), "");
assert(sys.links[0].work === 0);
sys.links[0].work = sys.links[0].required;
power.time = 0;
infrastructureStep(power, PROJECTS, 60);
assert(sys.nodes[solar.id].charge > 0, "Solar charges by day");
power.time = 1200;
const charge = sys.nodes[solar.id].charge;
infrastructureStep(power, PROJECTS, 10);
assert(sys.nodes[lamp.id].power > 0.99);
assert(sys.nodes[solar.id].charge < charge);
const stored = Object.values(sys.nodes).reduce((sum, n) => sum + n.charge, 0);
assert(
  Math.abs(
    sys.account.generated -
      sys.account.consumed -
      sys.account.curtailed -
      stored,
  ) < 1e-6,
  "Energy conservation",
);
sys.links[0].enabled = false;
infrastructureStep(power, PROJECTS, 1);
assert.equal(sys.nodes[lamp.id].power, 0);
console.log(
  "PASS: resident-installed connections, isolated loads, solar charging, night discharge, switched links and energy conservation.",
);
const water = fresh(),
  well = built(water, "well", 40, 40),
  wetland = built(water, "wetland", 44, 40),
  toilet = built(water, "eco_toilet", 40, 44),
  banana = built(water, "banana_treatment", 44, 44),
  generator = built(water, "solar_farm", 36, 40);
sys = syncInfrastructure(water, PROJECTS);
sys.nodes[well.id].water[1] = 30;
infrastructureStep(water, PROJECTS, 10);
assert.equal(sys.nodes[well.id].water[0], 0, "Filtering needs power");
assert.equal(connectUtility(water, "power", generator.id, well.id), "");
sys.links.forEach((l) => (l.work = l.required));
infrastructureStep(water, PROJECTS, 60);
assert(sys.nodes[well.id].water[0] > 0);
assert(sys.nodes[well.id].water[1] < 30);
assert.match(connectUtility(water, "sewage", toilet.id, well.id), /storage/);
assert.match(queueWater(water, -1, 0, "fresh"), /filter/);
sys.nodes[0].water[2] = 10;
assert.equal(transferWater(sys, 0, wetland.id, "greywater", 8), 8);
infrastructureStep(water, PROJECTS, 60);
assert(sys.nodes[wetland.id].water[1] > 0);
assert.equal(sys.nodes[wetland.id].water[0], 0);
sys.nodes[banana.id].water[3] = 10;
infrastructureStep(water, PROJECTS, 60);
assert(sys.nodes[banana.id].water[3] < 10);
assert.equal(sys.nodes[banana.id].water[0], 0);
assert(validInfrastructure(water));
const bad = structuredClone(water);
bad.infrastructure.nodes[well.id].water[0] = 999;
assert.equal(restore(save(bad)), null);
console.log(
  "PASS: powered filtration, water classes, treatment, no sewage-to-fresh conversion and invalid tank rejection.",
);
const jobs = fresh();
for (const id of Object.keys(jobs.materials)) jobs.materials[id] = 0;
jobs.materials.tools = 4;
jobs.materials.food = 20;
jobs.wood = 20;
const quarry = built(jobs, "supply-3", 40, 40);
assert.equal(queueProduction(jobs, quarry.id, "stone"), "");
run(jobs, 160);
assert.equal(jobs.materials.stone, 8);
assert(jobs.operations[0].done);
assert(sellMaterial(jobs, "stone") === false, "No full sale batch yet");
assert.equal(queueProduction(jobs, quarry.id, "stone"), "");
run(jobs, 160);
assert.equal(jobs.materials.stone, 16);
assert(sellMaterial(jobs, "stone"));
assert.equal(jobs.materials.stone, 4);
const trees = built(jobs, "supply-0", 44, 40);
assert.equal(queueProduction(jobs, trees.id, "wood"), "");
run(jobs, 180);
assert.match(queueProduction(jobs, trees.id, "wood"), /Growing/);
assert(storedMaterials(jobs) < storageCapacity(jobs));
console.log(
  "PASS: resident extraction, finite stock sales, renewable growth cooldown and storage.",
);
const labor = fresh();
for (const k of Object.keys(labor.materials)) labor.materials[k] = 0;
labor.materials.electrical = 10;
labor.materials.earth = 4;
labor.materials.food = 20;
labor.wood = 20;
const panel = built(labor, "solar_farm", 40, 40),
  shop = built(labor, "workshop", 44, 40);
assert.equal(connectUtility(labor, "power", panel.id, shop.id), "");
run(labor, 100);
assert(
  labor.infrastructure.links[0].work === labor.infrastructure.links[0].required,
  "Resident installs line",
);
assert.equal(queueProduction(labor, shop.id, "walls"), "");
run(labor, 180);
assert.equal(labor.materials.walls, 2);
assert(restore(save(labor)));
console.log(
  "PASS: residents install power, workshop processing consumes inputs once, outputs and infrastructure survive saves.",
);
const hauling = fresh();
hauling.rainSeen = true;
for (const id of Object.keys(hauling.materials)) hauling.materials[id] = 0;
const tank = built(hauling, "well", 40, 40);
assert.equal(queueWater(hauling, -1, tank.id, "irrigation"), "");
run(hauling, 220);
assert.equal(
  hauling.infrastructure.nodes[tank.id].water[1],
  12,
  "Resident actually fetches river water",
);
assert.equal(hauling.infrastructure.nodes[tank.id].water[0], 0);
console.log("PASS: physical river-water pickup and delivery to a local tank.");
