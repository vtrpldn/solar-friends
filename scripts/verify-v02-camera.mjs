import assert from "node:assert/strict";
import { cameraStep, installCameraNavigation } from "../web/v02/weekend/camera-navigation.js";
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

const {Vector3,OrthographicCamera}=await import('three');
const listeners={};
globalThis.addEventListener=(type,fn)=>listeners[type]=fn;
globalThis.document={querySelector:()=>null,addEventListener:()=>{}};
const camera=new OrthographicCamera();camera.position.set(10,10,10);
const controls={target:new Vector3(),minZoom:.1,maxZoom:10,addEventListener:()=>{}};
let homes=0;
const nav=installCameraNavigation(camera,controls,{home:()=>homes++});
listeners.keydown({code:'KeyW',preventDefault(){}});
nav.update(.1);
assert(controls.target.length()>0,'W pans without an interaction callback');
listeners.keyup({code:'KeyW'});
listeners.keydown({code:'Home',preventDefault(){}});
assert.equal(homes,1);
nav.rotate(.1);nav.zoom(1.1);
console.log('PASS: keyboard and button navigation without removed cutscene callback.');
