import assert from "node:assert/strict";
import {
  captureMotion,
  interpolateMotion,
} from "../web/v02/weekend/presentation.js";
function replay(fps, speed=1) {
  const state = { time: 0, arrivalElapsed: 0, people: [{ x: 0, z: 0 }] };
  let old = captureMotion(state),
    accumulator = 0;
  const frames = [];
  for (let frame = 0; frame < fps * 2; frame++) {
    accumulator += speed / fps;
    while (accumulator >= 0.1 - 1e-10) {
      old = captureMotion(state);
      state.time += 0.1;
      state.arrivalElapsed += 0.1;
      state.people[0].x += 0.1;
      accumulator = Math.max(0, accumulator - 0.1);
    }
    frames.push(interpolateMotion(old, state, accumulator / 0.1));
  }
  return frames;
}
for (const fps of [30, 60, 120]) {
  const frames = replay(fps);
  const moving = frames.filter(
    (f, i) => i && f.people[0].x > frames[i - 1].people[0].x + 1e-8,
  ).length;
  assert(
    moving > fps * 1.8,
    `${fps} Hz must show motion on display frames, not just the 10 Hz simulation ticks`,
  );
  assert(Math.abs(frames.at(-1).time - 1.9) < 1e-8);
  for (let i = fps / 2; i < frames.length; i++)
    assert(
      Math.abs(frames[i].people[0].x - frames[i - 1].people[0].x - 1 / fps) <
        1e-8,
    );
}
const old = { time: 2, arrivalElapsed: 6, people: [{ x: 0, z: 0 }] },
  now = { time: 2.1, arrivalElapsed: 6.1, people: [{ x: 0.1, z: 0 }] };
const a = interpolateMotion(old, now, 0.4);
assert.deepEqual(
  a,
  interpolateMotion(old, now, 0.4),
  "Paused presentation stays frozen",
);
assert.equal(
  interpolateMotion(old, { ...now, people: [{ x: 10, z: 0 }] }, 0.5).people[0]
    .x,
  10,
  "Do not tween town-return teleports",
);
assert.equal(interpolateMotion(old, now, 0.5).arrivalElapsed, 6.05);
console.log(
  "PASS: continuous positions and animation time at 30/60/120 Hz, equal real-time pace, frozen pause and teleport boundaries.",
);

for(const fps of [30,60,120]){const frames=replay(fps,4);assert(Math.abs(frames.at(-1).time-7.9)<1e-8);for(let i=fps;i<frames.length;i++)assert(Math.abs(frames[i].people[0].x-frames[i-1].people[0].x-4/fps)<1e-8);}
console.log("PASS: smooth 4x presentation without changing simulation pace.");
