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
  repeatProduction,
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
const finishJobs = (s) => {
  for (let i = 0; i < 6000; i++) {
    if (s.operations?.every((o) => o.done)) return;
    tick(s, 0.1);
  }
  assert.fail(`Jobs did not finish: ${JSON.stringify(s.operations)}`);
};
const fresh = () => {
  const s = createWeekend();
  s.arrivalElapsed = 17;
  chooseCamp(s, "clearing");
  for (const id of Object.keys(MATERIALS))
    if (id !== "wood") s.materials[id] = 500;
  s.wood = 500;
  syncInfrastructure(s, PROJECTS).grid.enabled = false; // Exercise self-sufficient utility behavior.
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
finishJobs(jobs);
assert.equal(jobs.materials.stone, 8);
assert(jobs.operations[0].done);
assert(sellMaterial(jobs, "stone") === false, "No full sale batch yet");
assert.equal(queueProduction(jobs, quarry.id, "stone"), "");
finishJobs(jobs);
assert.equal(jobs.materials.stone, 16);
assert(sellMaterial(jobs, "stone"));
assert.equal(jobs.materials.stone, 4);
const trees = built(jobs, "supply-0", 44, 40);
assert.equal(queueProduction(jobs, trees.id, "wood"), "");
finishJobs(jobs);
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
finishJobs(labor);
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
finishJobs(hauling);
assert.equal(
  hauling.infrastructure.nodes[tank.id].water[1],
  12,
  "Resident actually fetches river water",
);
assert.equal(hauling.infrastructure.nodes[tank.id].water[0], 0);
console.log("PASS: physical river-water pickup and delivery to a local tank.");

// No free pumping and no water appearing from an incompatible pipe.
const pumped = fresh();
pumped.rainSeen = true;
const pumpTank = built(pumped, "well", 40, 40),
  pumpSolar = built(pumped, "solar_farm", 44, 40);
let ps = syncInfrastructure(pumped, PROJECTS);
ps.nodes[0].water[0] = 0;
ps.nodes[pumpTank.id].water[0] = 20;
assert.equal(connectUtility(pumped, "fresh", pumpTank.id, 0), "");
ps.links[0].work = ps.links[0].required;
infrastructureStep(pumped, PROJECTS, 10);
assert.equal(ps.nodes[0].water[0], 0);
assert.equal(connectUtility(pumped, "power", pumpSolar.id, pumpTank.id), "");
ps.links[1].work = ps.links[1].required;
infrastructureStep(pumped, PROJECTS, 10);
assert(ps.nodes[0].water[0] > 0);
assert(ps.nodes[pumpTank.id].water[0] < 20);
const liquidTotal = Object.values(ps.nodes).reduce(
  (sum, n) => sum + n.water.reduce((a, b) => a + b, 0),
  0,
);
assert(
  Math.abs(liquidTotal + ps.account.waterUsed + ps.account.waterLost - 20) <
    1e-6,
);
console.log(
  "PASS: powered pipe flow, no unpowered pumping and water mass conservation.",
);

const pending = fresh();
pending.rainSeen = true;
for (const id of Object.keys(pending.materials)) pending.materials[id] = 0;
pending.materials.electrical = 10;
pending.materials.earth = 4;
pending.materials.food = 20;
const pendingShop = built(pending, "workshop", 40, 40),
  pendingSolar = built(pending, "solar_farm", 44, 40);
assert.equal(queueProduction(pending, pendingShop.id, "walls"), "");
assert.equal(
  connectUtility(pending, "power", pendingSolar.id, pendingShop.id),
  "",
);
finishJobs(pending);
assert.equal(
  pending.materials.walls,
  2,
  "Queued processing must not deadlock utility installation",
);
const again = restore(save(pending));
assert(again);
run(again, 80);
assert.equal(
  again.materials.walls,
  2,
  "Completed output must not duplicate after reload",
);
console.log(
  "PASS: utility installation unblocks queued production and reload does not duplicate output.",
);
const intake = fresh();
intake.rainSeen = true;
const intakeTank = built(intake, "well", 40, 40),
  intakeSolar = built(intake, "solar_farm", 44, 40);
assert.equal(connectUtility(intake, "irrigation", -1, intakeTank.id), "");
let ins = intake.infrastructure;
ins.links.forEach((l) => (l.work = l.required));
infrastructureStep(intake, PROJECTS, 10);
assert.equal(ins.nodes[intakeTank.id].water[1], 0);
assert.equal(connectUtility(intake, "power", intakeSolar.id, -1), "");
ins.links.forEach((l) => (l.work = l.required));
infrastructureStep(intake, PROJECTS, 10);
assert(ins.nodes[intakeTank.id].water[1] > 0);
assert.equal(ins.nodes[intakeTank.id].water[0], 0);
assert.equal(
  connectUtility(intake, "power", intakeSolar.id, intakeTank.id),
  "",
);
ins.links.forEach((l) => (l.work = l.required));
infrastructureStep(intake, PROJECTS, 10);
assert(ins.nodes[intakeTank.id].water[0] > 0);
console.log(
  "PASS: river intake needs installed pump power, then the cistern independently needs power to filter.",
);

const auto = fresh();
auto.rainSeen = true;
for (const id of Object.keys(auto.materials)) auto.materials[id] = 0;
auto.materials.food = 30;
const autoQuarry = built(auto, "supply-3", 40, 40);
assert(repeatProduction(auto, autoQuarry.id, "stone"));
// Allow the longer carrying route from the map-edge unloading area.
for (let i = 0; i < 18000 && auto.materials.stone < 24; i++) tick(auto, 0.1);
assert.equal(
  auto.materials.stone,
  24,
  "Automatic production stops at target instead of hoarding",
);
const outputBefore = auto.materials.stone;
run(auto, 100);
assert.equal(auto.materials.stone, outputBefore);
assert(sellMaterial(auto, "stone"));
for (let i = 0; i < 18000 && auto.materials.stone < 24; i++) tick(auto, 0.1);
assert(auto.materials.stone >= 24 && auto.materials.stone < 32);
console.log(
  "PASS: repeat production respects its stock target and restarts after surplus is sold.",
);
