import assert from "node:assert/strict";
import { BUILDING_MODELS } from "../web/v02/weekend/building-models.js";
import {
  PROJECTS,
  MATERIALS,
  PROCESSES,
  createWeekend,
  chooseCamp,
  plan,
  tick,
  placementError,
  requiredLoads,
  queueProduction,
  restingDoor,
  moveProject,
  save,
  restore,
} from "../web/v02/weekend/simulation.js";
import {
  syncInfrastructure,
  connect,
  infrastructureStep,
} from "../web/v02/weekend/infrastructure.js";
function run(s, seconds, done = () => false) {
  for (let i = 0; i < seconds * 10; i++) {
    tick(s, 0.1);
    if (done()) return true;
  }
  return done();
}
function fresh() {
  const s = createWeekend();
  s.arrivalElapsed = 17;
  chooseCamp(s, "clearing");
  s.rainSeen = true;
  s.wood = 100;
  for (const k in MATERIALS) if (k !== "wood") s.materials[k] = 10;
  return s;
}
function built(s, key, x = 40, z = 40) {
  assert.equal(placementError(s,key,x,z), "", `${key}: invalid completed-building fixture`);
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
}
const allBuilds=Object.entries(PROJECTS);
const startAt=process.argv.find(arg=>arg.startsWith('--from='))?.slice(7);
assert(!startAt || PROJECTS[startAt], 'Unknown starting building');
const builds=startAt ? allBuilds.slice(allBuilds.findIndex(([key])=>key===startAt)) : allBuilds;
for (const [key, def] of builds) {
  const s = fresh();
  s.wood = 500;
  for (const k in s.materials) s.materials[k] = 100;
  let spot;
  for (let z = 34; z < 50 && !spot; z++)
    for (let x = key === "bridge" ? 5 : 20; x < 48 && !spot; x++)
      if (!placementError(s, key, x, z)) spot = { x, z };
  assert(spot, `${key}: no reachable placement`);
  console.log(`Checking resident construction: ${key}`);
  assert.equal(plan(s, key, spot.x, spot.z), "");
  assert(
    run(s, Math.max(1300, def.work), () => s.projects[0].work === def.work),
    `${key}: residents failed to build`,
  );
  assert.equal(
    s.projects[0].delivered,
    requiredLoads(key),
    `${key}: incorrect delivered materials`,
  );
  assert(restore(save(s)), `${key}: completed building cannot reload`);
}
console.log(
  `PASS: ${builds.length} build choices physically supplied, built and saved by residents`,
);
for (const [recipe, def] of Object.entries(PROCESSES)) {
  const s = fresh();
  const key = Object.keys(PROJECTS).find((k) => PROJECTS[k].kind === def.kind);
  const p = built(s, key),
    solar = built(s, "solar_farm", 45, 40);
  const sys = syncInfrastructure(s, PROJECTS);
  sys.nodes[p.id].water = sys.nodes[p.id].capacity.map((c, i) =>
    i < 2 ? c : 0,
  );
  assert.equal(connect(s, PROJECTS, "power", solar.id, p.id), "");
  sys.links.forEach((l) => (l.work = l.required));
  const outputBefore = Object.fromEntries(
    Object.keys(def.output).map((k) => [
      k,
      k === "wood" ? s.wood : s.materials[k],
    ]),
  );
  assert.equal(queueProduction(s, p.id, recipe), "");
  let visited = false;
  assert(
    run(s, 500, () => {
      visited ||= s.people.some(
        (r) => r.action === "produce" && Math.hypot(r.x - p.x, r.z - p.z) < 5,
      );
      return s.operations[0].done;
    }),
    `${recipe}: ${s.operations[0].status}`,
  );
  assert(visited, `${recipe}: no worker visited site`);
  for (const [k, n] of Object.entries(def.output))
    assert.equal(
      k === "wood" ? s.wood : s.materials[k],
      outputBefore[k] + n,
      `${recipe}: delivered output`,
    );
  assert(restore(save(s)), `${recipe}: invalid save`);
}
console.log(
  `PASS: all ${Object.keys(PROCESSES).length} production recipes visited, worked and returned to storage`,
);
for (const model of BUILDING_MODELS.filter(
  (m) => m.category === "Homes" || m.id.startsWith("canvas-tent"),
)) {
  const s = fresh(),
    p = built(s, model.id);
  s.people.forEach((r) => (r.energy = 10));
  assert(
    run(s, 180, () =>
      s.people.some((r) => r.restSite === p.id && r.tentPhase === "inside"),
    ),
    `${model.id}: no resident entered`,
  );
  assert(
    s.people.filter((r) => r.restSite === p.id).length <= 2,
    "Beds overbooked",
  );
  assert.match(moveProject(s, p.id, 44, 44), /resting/);
  const reloaded = restore(save(s));
  assert(reloaded);
  assert(
    run(reloaded, 240, () =>
      reloaded.people.every((r) => !r.tentPhase && r.energy >= 60),
    ),
    `${model.id}: failed to leave after resting`,
  );
}
console.log(
  "PASS: every house variation and added tent offers bounded indoor rest, exit and save restore",
);
{
  const s = fresh(),
    p = built(s, "wash-station");
  s.infrastructure.nodes[p.id].water[0] = 8;
  s.people[0].work = 60;
  assert(
    run(s, 160, () => s.infrastructure.nodes[p.id].water[2] > 0.7),
    "Standalone wash station never used",
  );
  assert(s.people[0].cleanedAtWork >= 55);
}
{
  const s = fresh(),
    p = built(s, "eco_toilet");
  s.time = 200;
  s.people.forEach((r) => (r.toiletAt = 200));
  s.people[0].toiletAt = 0;
  assert(
    run(s, 100, () => s.infrastructure.nodes[p.id].water[3] > 0),
    "No physical toilet visit",
  );
  assert.equal(s.infrastructure.nodes[p.id].water[3], 1.5);
  assert(s.people[0].toiletAt > 200);
}
{
  const s = fresh(),
    p = built(s, "square");
  assert(
    run(s, 100, () =>
      s.people.some(
        (r) =>
          r.action === "relax" &&
          !r.walk.length &&
          Math.hypot(r.x - p.x, r.z - p.z) < 4,
      ),
    ),
    "Square unused",
  );
}
{
  const s = fresh(),
    p = built(s, "shed");
  s.rain = true;
  s.rainAt = 1000;
  assert(
    run(s, 100, () =>
      s.people.some(
        (r) =>
          r.action === "relax" &&
          !r.walk.length &&
          r.x >= p.x - 0.1 &&
          r.x <= p.x + 1.1 &&
          Math.abs(r.z - p.z) < 0.1,
      ),
    ),
    "Shed never shelters residents",
  );
}
for (const key of ["warehouse", "supply-5"]) {
  const s = fresh(),
    store = built(s, key, 38, 40),
    quarry = built(s, "supply-3", 43, 40);
  assert.equal(queueProduction(s, quarry.id, "stone"), "");
  assert(run(s, 300, () => s.operations[0].done));
  assert(
    s.people.some((r) => Math.hypot(r.x - store.x, r.z - store.z) < 3),
    `${key}: no delivery at storage`,
  );
}
{
  const s = fresh(),
    p = built(s, "goat-pasture-empty");
  s.infrastructure.nodes[p.id].water[0] = 6;
  const goats = s.materials.goats;
  assert.equal(queueProduction(s, p.id, "milk"), "");
  assert(p.stocked);
  assert.equal(s.materials.goats, goats - 1);
  assert(run(s, 400, () => s.operations[0].done));
}
{
  const s = fresh(),
    battery = built(s, "supply-6"),
    lamp = built(s, "streetlight", 44, 40);
  assert.equal(connect(s, PROJECTS, "power", battery.id, lamp.id), "");
  s.infrastructure.links[0].work = s.infrastructure.links[0].required;
  const n = s.infrastructure.nodes[battery.id];
  n.charge = 20;
  n.enabled = false;
  s.time = 1800;
  infrastructureStep(s, PROJECTS, 1);
  assert.equal(s.infrastructure.nodes[lamp.id].power, 0);
  assert.equal(n.charge, 20);
  n.enabled = true;
  infrastructureStep(s, PROJECTS, 1);
  assert.equal(s.infrastructure.nodes[lamp.id].power, 1);
  assert(n.charge < 20);
}
console.log(
  "PASS: wash station, toilet visits, square, rain shelter, storage deliveries, empty pasture stocking and battery isolation",
);
{
  const s = fresh(),
    digester = built(s, "biodigester"),
    kitchen = built(s, "kitchen", 44, 40);
  s.infrastructure.nodes[digester.id].water[3] = 12;
  s.infrastructure.nodes[kitchen.id].water[0] = 6;
  infrastructureStep(s, PROJECTS, 60);
  assert(s.infrastructure.biogas > 0.2);
  assert.equal(queueProduction(s, kitchen.id, "meals"), "");
  assert(
    run(s, 400, () => s.operations[0].done),
    "Biogas kitchen failed",
  );
  assert(
    s.operations[0].biogas,
    "Kitchen did not consume its own biogas batch",
  );
}
{
  const s = fresh(),
    hydro = built(s, "hydro", 20, 40),
    barrel = built(s, "rain-barrel", 40, 40);
  s.time = 1800;
  s.rain = true;
  infrastructureStep(s, PROJECTS, 60);
  assert(
    s.infrastructure.nodes[hydro.id].generation > 0,
    "Hydro stopped at night",
  );
  assert(
    s.infrastructure.nodes[barrel.id].water[1] > 0,
    "Barrel did not catch rain",
  );
  assert.equal(
    s.infrastructure.nodes[barrel.id].water[0],
    0,
    "Rain became potable without filtering",
  );
}
console.log(
  "PASS: sewage-derived biogas powers real kitchen work, hydro runs at night, rain barrels collect non-potable water",
);
