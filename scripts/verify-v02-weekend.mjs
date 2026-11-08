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
} from "../web/v02/weekend/simulation.js";
function createWeekend() {
  const s = createFreshWeekend();
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
  assert.equal(s.money, 170);
  run(s, 420);
  assert(finished(s, "gathering"), `${camp} gathering stalls`);
  assert(finished(s, "shelter"), `${camp} shelter stalls`);
  assert(s.people.every((r) => r.energy >= 0 && r.energy <= 100));
  if (camp === "entrance") {
    assert(!canFinish(s));
    assert(resolveRain(s, "move"));
  }
  assert(canFinish(s));
  assert(endWeekend(s));
  run(s, 60);
  assert(s.people.every((r) => r.action === "meal"));
  assert(restore(save(s)));
}
const s = createWeekend();
assert(!plan(s, "water", 30, 30).includes("Unknown"));
chooseCamp(s, "shade");
assert.equal(plan(s, "gathering", 30, 32), "");
assert(plan(s, "shelter", 31, 33));
assert(plan(s, "shelter", 19, 30));
assert(plan(s, "gathering", 35, 35));
assert.equal(plan(s, "water", 35, 35), "");
assert(supplyRun(s));
assert(!supplyRun(s));
run(s, 60);
assert.equal(s.wood, 23);
assert(!s.trip);
assert.equal(s.money, 105);
assert.equal(moveProject(s, 1, 28, 33), "");
run(s, 360);
assert(finished(s, "gathering"));
assert(finished(s, "water"));
assert.equal(plan(s, "toilet", 39, 30), "");
run(s, 240);
assert(finished(s, "toilet"));
assert.equal(plan(s, "shelter", 40, 36), "");
run(s, 300);
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
  "PASS: three camp playthroughs, rain choices, supply trip accounting, all four projects, relocation, obstacle paths, energy bounds, evening and save validation.",
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
  run(tired, 150);
  assert(
    tired.people.every((r) => r.energy >= 80),
    "Exhausted residents recover without player babysitting",
  );
}
const routes = createWeekend();
chooseCamp(routes, "entrance");
assert.equal(plan(routes, "gathering", 29, 35), "");
assert(plan(routes, "water", 27, 35), "Must not block existing work access");
assert(plan(routes, "water", 33, 25), "Must not build over tents");
const trip = createWeekend();
chooseCamp(trip, "shade");
supplyRun(trip);
run(trip, 20);
const resumed = restore(save(trip));
assert(resumed);
run(resumed, 36);
assert.equal(resumed.wood, 30);
run(resumed, 60);
assert.equal(resumed.wood, 30, "Supply trip must not pay twice after reload");
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
assert.equal(
  chooseCamp(intro, "shade"),
  false,
  "Cannot choose camp before everyone exits",
);
run(intro, 4);
assert(intro.arrivalElapsed > 3.9 && intro.arrivalElapsed < 4.1);
assert.equal(intro.time, 0, "Arrival does not consume the working day");
const introSaved = restore(save(intro));
assert(introSaved);
assert.equal(introSaved.arrivalElapsed, intro.arrivalElapsed);
run(introSaved, 14);
assert.equal(introSaved.arrivalElapsed, 17);
assert(chooseCamp(introSaved, "shade"));
const { arrivalPose } = await import("../web/v02/weekend/arrival.js");
for (let i = 0; i < 5; i++) {
  assert(!arrivalPose(5, i).visible);
  const pose = arrivalPose(17, i);
  assert(pose.visible && !pose.walking);
  assert(Math.abs(pose.x - (intro.people[i].x - 32) * 2) < 1e-8);
  assert.equal(pose.z, (intro.people[i].z - 32) * 2);
}
assert(Math.abs(arrivalPose(6, 0).car.x + 1) < 1e-8);
assert.equal(arrivalPose(6, 0).car.z, -22);
console.log(
  "PASS: driving before exits, staggered disembarkation, final positions, camp gating and saved arrival progress.",
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
assert.match(plan(entranceCamp, "water", 32, 22), /access road/);
assert(
  accessRoadAt((1.1 - 7) / 2 + 32, 0),
  "Access road reaches the northern plot boundary",
);
console.log(
  "PASS: boundary connection, vehicle alignment and access-road construction protection.",
);
