import assert from "node:assert/strict";
import {
  createWeekend,
  tick,
  chooseCamp,
  plan,
  supplyRun,
  canFinish,
  endWeekend,
  save,
  restore,
  PROJECTS,
} from "../web/v02/weekend/simulation.js";
import { openingProgress } from "../web/v02/weekend/opening.js";
const run = (s, n) => {
  for (let i = 0; i < n * 10; i++) tick(s, 0.1);
};
for (const [name, cover, storage] of [
  ["temporary", "rain-tent", "covered-stores"],
  ["permanent", "shelter", "tarp-stores"],
  ["investment", "shelter", "covered-stores"],
]) {
  const s = createWeekend();
  run(s, 18);
  chooseCamp(s, "clearing");
  assert.equal(plan(s, "gathering", 29, 35), "");
  assert.equal(plan(s, cover, 34, 39), "");
  if (name === "investment") {
    assert(plan(s, storage, 40, 39).startsWith("Missing"));
    assert(supplyRun(s, "wood"));
    assert.equal(s.people.filter((r) => r.action === "town").length, 1);
    run(s, 65);
    assert(supplyRun(s, "roofing"));
    run(s, 65);
  }
  assert.equal(plan(s, storage, 40, 39), "");
  assert(!canFinish(s));
  let seconds = 0;
  while (!canFinish(s) && seconds < 1800) {
    run(s, 1);
    seconds++;
  }
  assert(canFinish(s), `${name}: opening stalled`);
  assert(openingProgress(s, PROJECTS).count === 3);
  assert(restore(save(s)));
  assert(endWeekend(s));
  assert(s.opening.complete);
  console.log(
    `PASS ${name}: camp ready after ${seconds} active seconds; R$${s.money}, ${s.opening.townTrips} trips.`,
  );
}
// A tarp cannot be spent twice; rejecting a plan must not consume anything.
const scarce = createWeekend();
run(scarce, 18);
chooseCamp(scarce, "entrance");
assert.equal(plan(scarce, "rain-tent", 34, 39), "");
const before = {
  wood: scarce.wood,
  money: scarce.money,
  projects: scarce.projects.length,
};
assert(plan(scarce, "tarp-stores", 40, 39).includes("Missing"));
assert.deepEqual(
  { wood: scarce.wood, money: scarce.money, projects: scarce.projects.length },
  before,
);
run(scarce, 241);
assert(scarce.rainSeen && !scarce.rainResolved);
assert.equal(plan(scarce, "covered-stores", 40, 39), "");
run(scarce, 400);
assert(scarce.rainResolved, "built cover resolves exposed supplies");
assert(restore(save(scarce)));
assert(!canFinish(scarce), "shelter and stores cannot replace gathering");
const invalid = JSON.parse(save(scarce));
invalid.opening.townTrips = -1;
assert.equal(restore(JSON.stringify(invalid)), null);
console.log(
  "PASS scarce tarp, atomic rejection, exposed-site rain, construction payoff and incomplete-goal gating.",
);
