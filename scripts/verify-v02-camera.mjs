import assert from "node:assert/strict";
import { cameraStep } from "../web/v02/weekend/camera-navigation.js";
const step = (keys, x = 10, z = 10, dt = 1) =>
  cameraStep({ x, z, zoom: 1 }, new Set(keys), dt);
assert(step(["KeyW"]).x < 0 && step(["KeyW"]).z < 0);
assert(step(["KeyD"]).x > 0 && step(["KeyD"]).z < 0);
assert(step(["KeyW"], -10, 10).x > 0, "Forward follows the rotated camera");
assert.deepEqual(step(["KeyW"]), step(["ArrowUp"]));
assert.equal(step(["KeyW", "KeyS"]).x, 0);
const length = (v) => Math.hypot(v.x, v.z);
assert(
  Math.abs(length(step(["KeyW"])) - length(step(["KeyW", "KeyD"]))) < 1e-9,
  "Diagonal movement is normalized",
);
assert(
  Math.abs(length(step(["KeyW", "ShiftLeft"])) / length(step(["KeyW"])) - 2.2) <
    1e-9,
);
assert(
  Math.abs(
    step(["KeyD"], 10, 10, 1 / 30).x * 30 -
      step(["KeyD"], 10, 10, 1 / 120).x * 120,
  ) < 1e-9,
);
assert(step(["KeyQ"]).angle < 0 && step(["KeyE"]).angle > 0);
assert(step(["Equal"]).zoom > 1 && step(["Minus"]).zoom < 1);
console.log(
  "PASS: camera-relative directions, arrows, diagonal normalization, sprint, frame-rate independence, rotation and zoom.",
);
