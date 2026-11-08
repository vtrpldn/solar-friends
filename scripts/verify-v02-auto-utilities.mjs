import assert from "node:assert/strict";
import {
  createSandbox,
  PROJECTS,
  requiredLoads,
  save,
  restore,
  tick,
  moveProject,
} from "../web/v02/weekend/simulation.js";
import { autoConnectUtilities } from "../web/v02/weekend/auto-utilities.js";
import {
  infrastructureStep,
  validInfrastructure,
} from "../web/v02/weekend/infrastructure.js";
const s = createSandbox();
const add = (key, x, z, complete = true) => {
  const p = {
    id: s.nextId++,
    key,
    x,
    z,
    work: complete ? PROJECTS[key].work : 0,
    delivered: requiredLoads(key),
  };
  s.projects.push(p);
  return p;
};
const solar = add("solar_farm", 40, 50),
  well = add("well", 45, 50),
  home = add("house", 50, 50),
  garden = add("garden", 55, 50),
  reed = add("wetland", 60, 50),
  toilet = add("eco_toilet", 65, 50),
  treatment = add("banana_treatment", 70, 50),
  unfinished = add("workshop", 75, 50, false);
const materials = JSON.stringify(s.materials);
const sys = autoConnectUtilities(s, PROJECTS);
assert.equal(
  JSON.stringify(s.materials),
  materials,
  "automatic connections require no separate purchases",
);
assert.ok(!sys.nodes[unfinished.id]);
const link = (kind, from, to) =>
  sys.links.find((l) => l.kind === kind && l.from === from && l.to === to);
assert.ok(link("irrigation", -1, well.id));
assert.ok(link("fresh", well.id, home.id));
assert.ok(link("greywater", home.id, reed.id));
assert.ok(link("sewage", toilet.id, treatment.id));
assert.ok(sys.links.every((l) => l.work === l.required && l.automatic));
for (let i = 0; i < 600; i++) infrastructureStep(s, PROJECTS, 0.1);
assert.ok(sys.nodes[well.id].power > 0.99);
assert.ok(sys.nodes[home.id].water[0] > 0, "cistern delivers treated water");
assert.ok(sys.nodes[garden.id].water[1] > 0, "plants get irrigation");
assert.ok(sys.account.waterReceived >= 40);
const count = sys.links.length;
autoConnectUtilities(s, PROJECTS);
assert.equal(sys.links.length, count);
const switched = link("fresh", well.id, home.id);
switched.enabled = false;
const loaded = restore(save(s));
assert.ok(loaded);
autoConnectUtilities(loaded, PROJECTS);
assert.equal(
  loaded.infrastructure.links.find((l) => l.id === switched.id).enabled,
  false,
);
unfinished.work = PROJECTS.workshop.work;
autoConnectUtilities(s, PROJECTS);
assert.ok(
  sys.links.some(
    (l) =>
      l.kind === "power" &&
      (l.from === unfinished.id || l.to === unfinished.id),
  ),
);
assert.equal(moveProject(s, home.id, 60, 60), "");
autoConnectUtilities(s, PROJECTS);
assert.equal(sys.nodes[home.id].x, 60);
assert.ok(validInfrastructure(s));
console.log(
  "PASS: automatic compatible networks, completed buildings only, powered filtration and delivery, separate wastewater, no extra material charge, idempotence, switches, moves and saves.",
);
