import { ensureInfrastructure } from "../web/v02/weekend/infrastructure.js";
import { ROAD_SHIFT, PARK_Z } from "../web/v02/weekend/road-layout.js";
import assert from "node:assert/strict";
import {
  createWeekend as createFreshWeekend,
  chooseCamp,
  plan,
  tick,
  finished,
  canFinish,
  endWeekend,
  supplyRun,
  resolveRain,
  moveProject,
  save,
  restore,
  route,
  walkSegmentClear,
  PROJECTS,
  MATERIALS,
  requiredLoads,
} from "../web/v02/weekend/simulation.js";
function createWeekend() {
  const s = createFreshWeekend();
  ensureInfrastructure(s).grid.enabled = false; // Keep original off-grid regression coverage.
  for (let i = 0; i < 171; i++) tick(s, 0.1);
  return s;
}
function run(s, seconds) {
  for (let i = 0; i < seconds * 10; i++) tick(s, 0.1);
}
for (const camp of ["shade", "entrance", "clearing"]) {
  const s = createWeekend();
  assert(chooseCamp(s, camp));
  assert.equal(plan(s, "gathering", 29, 35), "");
  assert.equal(plan(s, "shelter", 34, 39), "");
  assert.equal(s.wood, 4);
  assert.equal(s.money, 220);
  run(s, 1800);
  assert(finished(s, "gathering"), `${camp} gathering stalls`);
  assert(finished(s, "shelter"), `${camp} shelter stalls`);
  assert(s.people.every((r) => r.energy >= 0 && r.energy <= 100));
  if (camp === "entrance") {
    assert(!canFinish(s));
    assert(s.rainResolved, "The entrance no longer forces a flood event");
  }
  assert.equal(plan(s, "tarp-stores", 40, 39), "");
  run(s, 600);
  assert(canFinish(s));
  assert(endWeekend(s));
  run(s, 240);
  assert(s.people.every((r) => r.action === "meal"));
  assert(restore(save(s)));
}
const s = createWeekend();
assert(!plan(s, "water", 30, 30).includes("Unknown"));
chooseCamp(s, "shade");
assert.equal(plan(s, "gathering", 30, 32), "");
assert(plan(s, "shelter", 31, 32));
assert(plan(s, "shelter", 19, 30));
assert(plan(s, "gathering", 35, 35));
assert.equal(plan(s, "water", 35, 35), "");
assert(supplyRun(s));
assert(!supplyRun(s));
run(s, 240);
assert.equal(s.wood, 32);
assert(!s.trip);
assert.equal(s.money, 175);
assert.equal(moveProject(s, 1, 28, 33), "");
run(s, 600);
assert(finished(s, "gathering"));
assert(finished(s, "water"));
assert.equal(plan(s, "toilet", 39, 30), "");
run(s, 900);
assert(finished(s, "toilet"));
assert(supplyRun(s));
run(s, 240);
assert.equal(plan(s, "shelter", 40, 36), "");
run(s, 1800);
assert(finished(s, "shelter"));
assert(s.people.some((r) => r.work > 0));
const path = route(s, { x: 28, z: 30 }, { x: 33, z: 35 });
assert(
  path &&
    path.every(
      (v) =>
        !s.projects.some(
          (p) => v.x >= p.x && v.x < p.x + 2 && v.z >= p.z && v.z < p.z + 2,
        ),
    ),
);
const bad = JSON.parse(save(s));
bad.projects[0].work = -1;
assert.equal(restore(JSON.stringify(bad)), null);
assert.equal(restore("{broken"), null);
const loaded = restore(save(s));
assert(loaded);
assert.equal(loaded.money, s.money);
assert.equal(loaded.projects.length, 4);
console.log(
  "PASS: three camp playthroughs, rain without forced flooding, supply trip accounting, all four projects, relocation, obstacle paths, energy bounds, evening and save validation.",
);
// A tank changes resident routines, rather than acting only as a quest checkbox.
assert(
  s.people.some((r) => r.cleanedAtWork > 0),
  "Workers use installed water storage between jobs",
);
for (const camp of ["shade", "clearing"]) {
  const tired = createWeekend();
  chooseCamp(tired, camp);
  for (const r of tired.people) r.energy = 10;
  run(tired, 300);
  assert(
    tired.people.every((r) => r.energy >= 75 && r.action !== "rest"),
    "Exhausted residents recover without player babysitting",
  );
}
const routes = createWeekend();
chooseCamp(routes, "entrance");
assert.equal(plan(routes, "gathering", 29, 35), "");
assert(plan(routes, "water", 27, 35), "Must not block existing work access");
assert(plan(routes, "water", 33, 25 - ROAD_SHIFT / 2), "Must not build over tents");
const trip = createWeekend();
chooseCamp(trip, "shade");
supplyRun(trip);
run(trip, 20);
const resumed = restore(save(trip));
assert(resumed);
run(resumed, 240);
assert.equal(resumed.wood, 48);
run(resumed, 60);
assert.equal(resumed.wood, 48, "Supply trip must not pay twice after reload");
assert.equal(plan(loaded, "water", 40, 40).length > 0, true);
console.log(
  "PASS: water use, autonomous recovery, protected work access and in-flight trip restore.",
);
const riverside = createWeekend();
chooseCamp(riverside, "clearing");
assert.match(
  plan(riverside, "gathering", 21, 38),
  /riverbank/,
  "River banks cannot become building sites",
);
assert.equal(
  plan(riverside, "gathering", 29, 35),
  "",
  "Central camp remains usable beside the river",
);
run(riverside, 180);
assert(finished(riverside, "gathering"), "River must not strand camp workers");
console.log(
  "PASS: riverbank building exclusion and accessible camp construction.",
);
const intro = createFreshWeekend();
assert.equal(intro.arrivalElapsed, 17, "New games skip the arrival cutscene");
run(intro, 4);
assert.equal(intro.time, 0, "Choosing a camp does not consume the day");
const introSaved = restore(save(intro));
assert(introSaved);
assert(chooseCamp(introSaved, "shade"), "Camp placement is immediately available");
const oldArrival = createFreshWeekend();
oldArrival.arrivalElapsed = 3;
assert.equal(restore(save(oldArrival)).arrivalElapsed, 17, "Old arrival saves skip the cutscene too");
const { arrivalPose } = await import("../web/v02/weekend/arrival.js");
for (let i = 0; i < 5; i++) {
  assert(!arrivalPose(5, i).visible);
  const pose = arrivalPose(17, i);
  assert(pose.visible && !pose.walking);
  assert(Math.abs(pose.x - (intro.people[i].x - 32) * 2) < 1e-8);
  assert.equal(pose.z, (intro.people[i].z - 32) * 2);
}
assert(Math.abs(arrivalPose(6, 0).car.x + 1) < 1e-8);
assert.equal(arrivalPose(6, 0).car.z, PARK_Z);
console.log(
  "PASS: immediate camp setup, parked resident positions and legacy arrival-save migration.",
);
const { vehiclePose } = await import("../web/v02/weekend/arrival.js");
for (let t = 0; t <= 17; t += 0.1) {
  const a = vehiclePose(t, 0),
    b = vehiclePose(t, 1);
  assert(
    Math.hypot(a.x - b.x, a.z - b.z) > 2.2,
    "SUVs maintain clearance during approach",
  );
}
assert.equal(
  arrivalPose(8, 3).visible,
  false,
  "Second vehicle passengers wait until it parks",
);
assert.equal(arrivalPose(9, 3).visible, true);
console.log(
  "PASS: two-vehicle clearance and second-car disembarkation timing.",
);
const { accessRoadAt } = await import("../web/v02/weekend/road-layout.js");
for (let t = 0; t <= 17; t += 0.25)
  for (const index of [0, 1]) {
    const pose = vehiclePose(t, index);
    for (const dx of [-1.1, 1.1])
      assert(
        accessRoadAt((pose.x + dx) / 2 + 32, pose.z / 2 + 32),
        "Both SUVs stay on the access road",
      );
  }
const entranceCamp = createWeekend();
chooseCamp(entranceCamp, "clearing");
assert.match(plan(entranceCamp, "water", 32, 22 - ROAD_SHIFT / 2), /access road/);
assert(
  accessRoadAt((1.1 - 7) / 2 + 32, -32),
  "Access road reaches the northern plot boundary",
);
console.log(
  "PASS: boundary connection, vehicle alignment and access-road construction protection.",
);
const social = createWeekend();
chooseCamp(social, "clearing");
const seen = new Set();
for (let i = 0; i < 1800; i++) {
  tick(social, 0.1);
  social.people.forEach((r) => seen.add(r.action));
}
for (const activity of ["look", "stretch", "chat", "stroll", "breathe"])
  assert(seen.has(activity), `Idle residents should ${activity}`);
assert(
  social.people.some((r) => r.idleCycle >= 3),
  "People stay with activities before choosing another",
);
assert.equal(plan(social, "gathering", 29, 35), "");
run(social, 180);
assert(finished(social, "gathering"), "Leisure must yield to useful work");
assert(
  social.people.every(
    (r) => Number.isFinite(r.x) && Number.isFinite(r.z) && r.energy >= 0,
  ),
);
console.log(
  "PASS: varied sustained leisure, nearby conversation and prompt return to village projects.",
);

const walking = createWeekend();
chooseCamp(walking, "clearing");
const openStart = { x: 38, z: 40 },
  openEnd = { x: 42, z: 43 };
assert.deepEqual(
  route(walking, openStart, openEnd),
  [openEnd],
  "Open ground should be one direct diagonal",
);
assert.equal(plan(walking, "gathering", 29, 35), "");
const start = { x: 27, z: 35 },
  end = { x: 33, z: 36 };
assert(
  !walkSegmentClear(walking, start, end),
  "Cannot shortcut through a project",
);
const detour = route(walking, start, end);
assert(detour && detour.length > 1);
assert(
  detour.some((p) => !Number.isInteger(p.x) || !Number.isInteger(p.z)),
  "Detour should round its corners",
);
let previous = start;
for (const point of detour) {
  assert(
    walkSegmentClear(walking, previous, point),
    "Every detour segment must clear obstacles",
  );
  for (let t = 0; t <= 1; t += 0.01) {
    const x = previous.x + (point.x - previous.x) * t,
      z = previous.z + (point.z - previous.z) * t;
    assert(
      !(x > 28.34 && x < 30.66 && z > 34.34 && z < 35.66),
      "Body clearance around construction",
    );
  }
  previous = point;
}
assert.deepEqual(route(walking, { x: 40, z: 42 }, { x: 40.2, z: 42.1 }), [
  { x: 40.2, z: 42.1 },
]);
console.log(
  "PASS: direct open-ground travel, rounded detours, swept body clearance and precise fractional destinations.",
);

const materialTest = createWeekend();
chooseCamp(materialTest, "clearing");
materialTest.money = 0;
assert.equal(
  plan(materialTest, "shelter", 29, 35),
  "",
  "Construction consumes no money",
);
assert.equal(materialTest.money, 0);
assert.equal(materialTest.wood, 12);
assert.equal(materialTest.materials.roofing, 2);
assert.equal(materialTest.materials.hardware, 4);
assert(requiredLoads("shelter") > requiredLoads("gathering"));
assert(PROJECTS.shelter.work > PROJECTS.gathering.work * 5);
assert.match(plan(materialTest, "toilet", 39, 30), /Missing materials cost.*savings/);
assert.equal(
  materialTest.materials.sanitation,
  1,
  "Failed plan consumes nothing",
);
assert(!supplyRun(materialTest, "wood"), "Purchases require money");
materialTest.money = 220;
assert(supplyRun(materialTest, "roofing"));
assert.equal(materialTest.money, 100);
assert.equal(
  materialTest.materials.roofing,
  2,
  "Purchases are unavailable until delivered",
);
run(materialTest, 20);
const delivery = restore(save(materialTest));
assert(delivery);
run(delivery, 240);
assert.equal(delivery.materials.roofing, 8);
run(delivery, 60);
assert.equal(delivery.materials.roofing, 8);
run(delivery, 1800);
assert(finished(delivery, "shelter"));
assert.equal(
  delivery.projects[0].delivered,
  requiredLoads("shelter"),
  "No duplicate material loads",
);
const invalidMaterials = JSON.parse(save(delivery));
invalidMaterials.materials.tank = -1;
assert.equal(restore(JSON.stringify(invalidMaterials)), null);
console.log(
  "PASS: material recipes, money-free construction, atomic reservations, proportional loads/labor, purchased inventory and saved deliveries.",
);

const eager = createWeekend();
chooseCamp(eager, "clearing");
assert.equal(plan(eager, "shelter", 29, 35), "");
for (const r of eager.people) {
  r.action = "stroll";
  r.idleUntil = eager.time + 200;
  r.walk = [{ x: 40, z: 40 }];
}
tick(eager, 0.1);
assert.equal(
  eager.people.filter((r) => r.job === eager.projects[0].id).length,
  5,
  "All available friends collaborate, interrupting leisure",
);
assert.equal(
  new Set(eager.people.map((r) => `${r.workSpot.x},${r.workSpot.z}`)).size,
  5,
  "Collaborators reserve distinct work positions",
);
const recovering = eager.people[0];
recovering.job = null;
recovering.walk = [];
recovering.target = null;
recovering.action = "rest";
recovering.energy = 60;
tick(eager, 0.1);
assert.equal(
  recovering.job,
  eager.projects[0].id,
  "Recovered residents promptly rejoin unfinished work",
);
run(eager, 900);
assert(finished(eager, "shelter"));
assert(
  eager.people.every((r) => r.work > 0),
  "Everyone contributes actual labor",
);
assert.equal(eager.projects[0].delivered, requiredLoads("shelter"));
console.log(
  "PASS: five-person collaboration, unique work positions, interrupted leisure, recovery and shared construction labor.",
);

const sleepers = createWeekend();
chooseCamp(sleepers, "clearing");
for (const r of sleepers.people) r.energy = 10;
const entered = new Set(),
  exited = new Set();
for (let n = 0; n < 1800; n++) {
  tick(sleepers, 0.1);
  for (const r of sleepers.people) {
    if (r.tentPhase === "inside") entered.add(r.id);
    if (r.tentPhase === "exit") exited.add(r.id);
  }
  if (n === 500)
    assert(restore(save(sleepers)), "Resting residents survive reload");
}
assert.equal(entered.size, 5, "All exhausted friends rest inside tents");
assert.equal(exited.size, 5, "All rested friends leave through the door");
assert(sleepers.people.every((r) => !r.tentPhase && r.energy >= 75));
console.log(
  "PASS: tent entry, indoor recovery, exit and resting save restore.",
);
