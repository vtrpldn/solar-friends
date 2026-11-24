import { MAP_HALF } from "./map-size.js";
import * as THREE from "three";
import { HELD, heldCode, binding } from "./keyboard-shortcuts.js";
const held = (keys, part) => HELD[part].some((code) => keys.has(code));
// `keys` holds the canonical code of each held direction (see heldCode).
export function cameraStep({ x, z, zoom }, keys, dt) {
  const length = Math.hypot(x, z) || 1;
  let sideways = Number(held(keys, "right")) - Number(held(keys, "left"));
  let forward = Number(held(keys, "forward")) - Number(held(keys, "back"));
  const magnitude = Math.hypot(sideways, forward) || 1;
  sideways /= magnitude;
  forward /= magnitude;
  const distance =
    ((24 * dt) / Math.sqrt(zoom)) * (held(keys, "fast") ? 2.2 : 1);
  return {
    x: ((sideways * z - forward * x) / length) * distance,
    z: ((-sideways * x - forward * z) / length) * distance,
    angle: (Number(held(keys, "turnRight")) - Number(held(keys, "turnLeft"))) * dt * 1.2,
    tilt: (Number(held(keys, "tiltDown")) - Number(held(keys, "tiltUp"))) * dt,
    zoom: Math.exp(
      (Number(held(keys, "zoomIn")) - Number(held(keys, "zoomOut"))) * dt * 1.3,
    ),
  };
}
export function installCameraNavigation(
  camera,
  controls,
  { home, allowDisabledControls = () => false, onInteract = () => {} },
) {
  // Physical key -> the movement it started, so a release always ends it even
  // if the layout or Shift state changed while the key was down.
  const keys = new Set(), pressed = new Map();
  const homeCodes = binding("home").code;
  const editing = (event) =>
    event.target?.closest?.(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog[open]',
    ) || document.querySelector("dialog[open]");
  addEventListener("keydown", (event) => {
    const isHome = homeCodes.includes(event.code);
    const code = isHome ? null : heldCode(event);
    if (
      (!code && !isHome) ||
      event.defaultPrevented || event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      editing(event) ||
      (event.code.startsWith("Arrow") && event.target?.closest?.("button,summary,a"))
    )
      return;
    event.preventDefault();
    onInteract();
    if (isHome) {
      if (!event.repeat) home();
      return;
    }
    pressed.set(event.code, code);
    keys.add(code);
  });
  const release = (event) => {
    const code = pressed.get(event.code);
    pressed.delete(event.code);
    if (code && ![...pressed.values()].includes(code)) keys.delete(code);
  };
  addEventListener("keyup", release);
  const clear = () => { keys.clear(); pressed.clear(); };
  addEventListener("blur", clear);
  document.addEventListener("focusin", clear);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clear();
  });
  const rotate = (angle) => {
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    camera.position.copy(controls.target).add(offset);
  };
  const zoom = (factor) => {
    camera.zoom = THREE.MathUtils.clamp(
      camera.zoom * factor,
      controls.minZoom,
      controls.maxZoom,
    );
    camera.updateProjectionMatrix();
  };
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.screenSpacePanning = false;
  controls.addEventListener("start", onInteract);
  return {
    rotate: (angle) => {
      onInteract();
      rotate(angle);
    },
    zoom: (factor) => {
      onInteract();
      zoom(factor);
    },
    update(dt) {
      if (document.querySelector("dialog[open]")) {
        clear();
        return;
      }
      if (!keys.size || document.hidden || (controls.enabled === false && !allowDisabledControls())) return;
      const offset = camera.position.clone().sub(controls.target);
      const step = cameraStep(
        { x: offset.x, z: offset.z, zoom: camera.zoom },
        keys,
        dt,
      );
      const x =
          THREE.MathUtils.clamp(
            controls.target.x + step.x,
            -MAP_HALF + 4,
            MAP_HALF - 4,
          ) - controls.target.x,
        z =
          THREE.MathUtils.clamp(
            controls.target.z + step.z,
            -MAP_HALF + 4,
            MAP_HALF - 4,
          ) - controls.target.z;
      controls.target.x += x;
      controls.target.z += z;
      camera.position.x += x;
      camera.position.z += z;
      if (step.angle) rotate(step.angle);
      if (step.tilt) {
        const orbit = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        orbit.phi = THREE.MathUtils.clamp(orbit.phi + step.tilt, controls.minPolarAngle, controls.maxPolarAngle);
        camera.position.setFromSpherical(orbit).add(controls.target);
      }
      if (step.zoom !== 1) zoom(step.zoom);
      return !!(step.x || step.z || step.angle || step.tilt || step.zoom !== 1);
    },
  };
}
