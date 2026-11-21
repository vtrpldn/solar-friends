import { MAP_HALF } from "./map-size.js";
import * as THREE from "three";
export function cameraStep({ x, z, zoom }, keys, dt) {
  const length = Math.hypot(x, z) || 1;
  let sideways =
    Number(keys.has("KeyD") || keys.has("ArrowRight")) -
    Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  let forward =
    Number(keys.has("KeyW") || keys.has("ArrowUp")) -
    Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const magnitude = Math.hypot(sideways, forward) || 1;
  sideways /= magnitude;
  forward /= magnitude;
  const distance =
    ((24 * dt) / Math.sqrt(zoom)) *
    (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2.2 : 1);
  return {
    x: ((sideways * z - forward * x) / length) * distance,
    z: ((-sideways * x - forward * z) / length) * distance,
    angle: (Number(keys.has("KeyE")) - Number(keys.has("KeyQ"))) * dt * 1.2,
    tilt: (Number(keys.has("Period")) - Number(keys.has("Comma"))) * dt,
    zoom: Math.exp(
      (Number(keys.has("Equal") || keys.has("NumpadAdd")) -
        Number(keys.has("Minus") || keys.has("NumpadSubtract"))) *
        dt *
        1.3,
    ),
  };
}
export function installCameraNavigation(
  camera,
  controls,
  { home, allowDisabledControls = () => false, onInteract = () => {} },
) {
  const keys = new Set(),
    handled = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "KeyQ",
      "KeyE",
      "Comma",
      "Period",
      "Equal",
      "Minus",
      "NumpadAdd",
      "NumpadSubtract",
      "Home",
      "ShiftLeft",
      "ShiftRight",
    ]);
  const editing = (event) =>
    event.target?.closest?.(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog[open]',
    ) || document.querySelector("dialog[open]");
  addEventListener("keydown", (event) => {
    if (
      !handled.has(event.code) ||
      event.defaultPrevented || event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      editing(event) ||
      (event.code.startsWith("Arrow") && event.target?.closest?.("button,summary,a"))
    )
      return;
    event.preventDefault();
    keys.add(event.code);
    onInteract();
    if (event.code === "Home" && !event.repeat) home();
  });
  addEventListener("keyup", (event) => keys.delete(event.code));
  addEventListener("blur", () => keys.clear());
  document.addEventListener("focusin", () => keys.clear());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) keys.clear();
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
        keys.clear();
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
