import fs from "node:fs/promises";
import assert from "node:assert/strict";
import init, { Game } from "../web/pkg/solar_friends.js";
await init({
  module_or_path: await fs.readFile(
    new URL("../web/pkg/solar_friends_bg.wasm", import.meta.url),
  ),
});
const output = process.argv[2];
if (output) await fs.mkdir(output, { recursive: true });
const g = new Game();
const snap = () => JSON.parse(g.snapshot());
function until(test, label, limit = 16000) {
  for (let i = 0; i < limit; i++) {
    if (test(snap())) return;
    g.tick(0.25);
  }
  throw new Error("Timed out: " + label + " " + g.snapshot());
}
async function fixture(name) {
  if (output) await fs.writeFile(`${output}/solar-${name}.json`, g.snapshot());
}
function build(kind, x, y) {
  until(
    (s) =>
      s.village.wood >=
      {
        well: 18,
        home: 32,
        garden: 12,
        kitchen: 40,
        grove: 14,
        compost: 20,
        square: 36,
        workshop: 48,
      }[kind],
    "timber for " + kind,
  );
  assert.equal(g.place(kind, x, y), "ok");
  until(
    (s) =>
      s.village.buildings.find((b) => b.x === x && b.y === y).progress >= 100,
    "finish " + kind,
  );
}
until((s) => s.village.arrived, "arrival");
for (const [k, x, y] of [
  ["well", 6, 10],
  ["home", 8, 8],
  ["garden", 13, 10],
  ["kitchen", 10, 10],
  ["home", 12, 7],
])
  build(k, x, y);
until((s) => s.village.progress.completed[0], "intro");
await fixture("intro");
console.log(
  "Introduction complete on day",
  1 + Math.floor(snap().village.minutes / 1440),
);
g.track_quest(1);
build("grove", 15, 13);
until((s) => s.village.progress.completed[1], "roots");
g.track_quest(2);
until(
  (s) =>
    s.village.progress.social_mask === 31 &&
    s.village.meals >= 5 &&
    s.village.minutes % 1440 >= 480 &&
    s.village.minutes % 1440 < 1080,
  "welcome supper ready",
);
await fixture("supper-ready");
until(() => g.host_gathering() === "ok", "start welcome supper");
until((s) => s.village.progress.completed[2], "gather quest");
g.track_quest(3);
until(() => g.contribute_workshop_timber() === "ok", "contribute timber");
until((s) => s.village.progress.completed[3], "hands");
for (const [k, x, y] of [
  ["compost", 6, 16],
  ["square", 6, 21],
  ["workshop", 12, 16],
])
  build(k, x, y);
until(
  (s) =>
    s.village.progress.enriched_harvests > 0 &&
    s.village.progress.tools_crafted > 0,
  "use compost and tools",
);
until(
  (s) => s.village.minutes % 1440 >= 500 && s.village.minutes % 1440 < 1000,
  "daylight",
);
await fixture("complete");
const s = snap();
assert.deepEqual(s.village.progress.completed, [true, true, true, true]);
console.log(
  JSON.stringify(
    {
      day: 1 + Math.floor(s.village.minutes / 1440),
      buildings: s.village.buildings.length,
      progress: s.village.progress,
    },
    null,
    2,
  ),
);
g.free();
