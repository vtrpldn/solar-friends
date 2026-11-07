import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ASSETS, createAsset } from "../workshop/models.js";
import {
  MAP_CELLS,
  MAP_METRES,
  CELL_METRES,
  PLACEMENTS,
  placementPosition,
  worldCell,
  cameraOffset,
} from "./layout.js";
const $ = (s) => document.querySelector(s);
const canvas = $("#land");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (error) {
  $("#toast").textContent =
    "The preview needs WebGL. Enable graphics acceleration and reload.";
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#dce2c8");
const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 600);
const controls = new OrbitControls(camera, canvas);
controls.enableRotate = false;
controls.enableDamping = false;
controls.screenSpacePanning = false;
controls.minZoom = 0.16;
controls.maxZoom = 3.5;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
let bearing = 0,
  night = false,
  selected = null,
  pending = false,
  toastTimer;
function render() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    renderer.render(scene, camera);
  });
}
function toast(text) {
  clearTimeout(toastTimer);
  $("#toast").textContent = text;
  toastTimer = setTimeout(() => {
    $("#toast").textContent = "";
  }, 2500);
}
const hemi = new THREE.HemisphereLight("#fff1cf", "#687547", 2.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#ffedcf", 3);
sun.position.set(-6, 18, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -22,
  right: 22,
  top: 22,
  bottom: -22,
  near: 0.1,
  far: 70,
});
sun.shadow.normalBias = 0.025;
sun.shadow.bias = -0.00015;
scene.add(sun);
// One continuous land surface: no per-cell meshes and no decorative ground islands.
const geometry = new THREE.PlaneGeometry(
  MAP_METRES,
  MAP_METRES,
  MAP_CELLS,
  MAP_CELLS,
);
geometry.rotateX(-Math.PI / 2);
const colors = [];
const pos = geometry.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i),
    z = pos.getZ(i);
  const c = new THREE.Color("#a9b983");
  const variation =
    Math.sin(x * 0.08) * Math.cos(z * 0.065) * 0.018 +
    Math.sin((x + z) * 0.11) * 0.008;
  c.offsetHSL(0, 0, variation);
  colors.push(c.r, c.g, c.b);
}
geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
const terrain = new THREE.Mesh(
  geometry,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
);
terrain.receiveShadow = true;
terrain.name = "64 × 64 land";
scene.add(terrain);
const earth = new THREE.Mesh(
  new THREE.BoxGeometry(MAP_METRES, 0.65, MAP_METRES),
  new THREE.MeshStandardMaterial({ color: "#aa895d", roughness: 1 }),
);
earth.position.y = -0.34;
scene.add(earth);
const grid = new THREE.GridHelper(MAP_METRES, MAP_CELLS, "#697d51", "#7b8b59");
grid.position.y = 0.006;
grid.material.transparent = true;
grid.material.opacity = 0.24;
grid.visible = false;
scene.add(grid);
const boundary = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(
    [
      [-64, 0.012, -64],
      [64, 0.012, -64],
      [64, 0.012, 64],
      [-64, 0.012, 64],
    ].map((p) => new THREE.Vector3(...p)),
  ),
  new THREE.LineBasicMaterial({ color: "#d0bb7f" }),
);
scene.add(boundary);
const objects = [];
const selectable = [];
for (const record of PLACEMENTS) {
  const def = ASSETS.find((a) => a.id === record.asset);
  const footprint =
    record.rotation % 180 ? [...def.footprint].reverse() : def.footprint;
  const model = createAsset(record.asset);
  model.position.set(
    ...placementPosition(record.column, record.row, footprint),
  );
  model.rotation.y = (record.rotation * Math.PI) / 180;
  model.userData.placement = record;
  model.userData.footprint = footprint;
  model.traverse((o) => {
    if (o.isMesh) {
      o.userData.previewRoot = model;
      selectable.push(o);
    }
  });
  scene.add(model);
  objects.push(model);
}
const selectionGeometry = new THREE.BufferGeometry();
const selectionOutline = new THREE.LineLoop(
  selectionGeometry,
  new THREE.LineBasicMaterial({ color: "#f5dc8e", depthTest: false }),
);
selectionOutline.renderOrder = 10;
selectionOutline.visible = false;
scene.add(selectionOutline);
const cursor = new THREE.Mesh(
  new THREE.PlaneGeometry(CELL_METRES, CELL_METRES),
  new THREE.MeshBasicMaterial({
    color: "#ecdfaa",
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  }),
);
cursor.rotation.x = -Math.PI / 2;
cursor.position.y = 0.009;
cursor.visible = false;
scene.add(cursor);
function select(model) {
  selected = model;
  $("#selection").hidden = !model;
  selectionOutline.visible = !!model;
  if (!model) {
    $("#object-name").textContent = "Room to grow";
    $("#object-description").textContent =
      "A 64 × 64 plot, with our first five props gathered at its center. Select a prop to inspect it.";
  } else {
    const r = model.userData.placement,
      def = ASSETS.find((a) => a.id === r.asset),
      [w, d] = model.userData.footprint.map((n) => n * CELL_METRES),
      { x, z } = model.position;
    selectionGeometry.setFromPoints(
      [
        [x - w / 2, 0.04, z - d / 2],
        [x + w / 2, 0.04, z - d / 2],
        [x + w / 2, 0.04, z + d / 2],
        [x - w / 2, 0.04, z + d / 2],
      ].map((v) => new THREE.Vector3(...v)),
    );
    $("#object-name").textContent = r.label;
    $("#object-description").textContent = def.description;
    $("#object-details").textContent =
      `Cell ${r.column + 1}, ${r.row + 1} · ${model.userData.footprint.join(" × ")} cells · ${r.rotation}°`;
  }
  for (const b of document.querySelectorAll("[data-asset]"))
    b.setAttribute(
      "aria-pressed",
      String(model?.userData.placement.asset === b.dataset.asset),
    );
  render();
}
function turn(delta) {
  bearing = (bearing + delta + 4) % 4;
  camera.position
    .copy(controls.target)
    .add(new THREE.Vector3(...cameraOffset(bearing)));
  camera.lookAt(controls.target);
  controls.update();
  $("#bearing").textContent = ["SE", "SW", "NW", "NE"][bearing];
  render();
}
function focusClearing() {
  controls.target.set(0, 0, 1);
  camera.zoom = 1;
  bearing = 0;
  resize();
  turn(0);
  toast("The first clearing · center of the plot");
}
function overview() {
  controls.target.set(0, 0, 0);
  camera.zoom = 1;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const span = Math.max(110, (MAP_METRES * Math.SQRT2) / aspect) * 1.2;
  setFrustum(span);
  turn(0);
  toast("64 × 64 cells · 128 × 128 metres");
}
let overviewMode = false;
function setFrustum(height) {
  const aspect = canvas.clientWidth / canvas.clientHeight;
  camera.left = (-height * aspect) / 2;
  camera.right = (height * aspect) / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
  render();
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  if (overviewMode) overview();
  else setFrustum(Math.max(25, 32 / (innerWidth / innerHeight)));
}
window.addEventListener("resize", resize);
controls.addEventListener("change", () => {
  const limit = MAP_METRES / 2;
  const target = controls.target.clone();
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -limit, limit);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, -limit, limit);
  camera.position.add(controls.target.clone().sub(target));
  render();
});
const raycaster = new THREE.Raycaster(),
  pointer = new THREE.Vector2();
let down = null,
  lastCell = "";
function pointerAt(e) {
  const r = canvas.getBoundingClientRect();
  pointer.set(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    (-(e.clientY - r.top) / r.height) * 2 + 1,
  );
  camera.updateMatrixWorld();
  raycaster.setFromCamera(pointer, camera);
}
canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, button: e.button };
});
canvas.addEventListener("pointerup", (e) => {
  if (
    !down ||
    down.button !== 0 ||
    Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5
  ) {
    down = null;
    return;
  }
  down = null;
  pointerAt(e);
  scene.updateMatrixWorld(true);
  const hit = raycaster.intersectObjects(selectable, false)[0];
  select(hit?.object.userData.previewRoot || null);
});
canvas.addEventListener("pointercancel", () => {
  down = null;
});
canvas.addEventListener("pointermove", (e) => {
  pointerAt(e);
  const point = raycaster.intersectObject(terrain, false)[0]?.point;
  const cell = point && worldCell(point.x, point.z);
  const key = cell ? `${cell.column},${cell.row}` : "";
  if (key === lastCell) return;
  lastCell = key;
  cursor.visible = !!cell && grid.visible;
  if (cell) {
    cursor.position.set(...placementPosition(cell.column, cell.row, [1, 1]));
    cursor.position.y = 0.009;
    $("#coordinate").textContent =
      `Cell ${cell.column + 1}, ${cell.row + 1} · 64 × 64`;
  } else $("#coordinate").textContent = "64 × 64 · 4,096 cells";
  render();
});
canvas.addEventListener("pointerleave", () => {
  cursor.visible = false;
  lastCell = "";
  $("#coordinate").textContent = "64 × 64 · 4,096 cells";
  render();
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
$("#home").onclick = () => {
  overviewMode = false;
  focusClearing();
};
$("#overview").onclick = () => {
  overviewMode = true;
  overview();
};
$("#left").onclick = () => turn(-1);
$("#right").onclick = () => turn(1);
$("#clear").onclick = () => select(null);
function zoom(factor) {
  camera.zoom = THREE.MathUtils.clamp(
    camera.zoom * factor,
    controls.minZoom,
    controls.maxZoom,
  );
  camera.updateProjectionMatrix();
  render();
}
$("#zoom-in").onclick = () => zoom(1.25);
$("#zoom-out").onclick = () => zoom(0.8);
$("#grid").onclick = () => {
  grid.visible = !grid.visible;
  cursor.visible = false;
  lastCell = "";
  $("#grid").setAttribute("aria-pressed", String(grid.visible));
  render();
};
$("#night").onclick = () => {
  night = !night;
  hemi.color.set(night ? "#a3b9de" : "#fff1cf");
  hemi.intensity = night ? 0.7 : 2.2;
  sun.color.set(night ? "#b2c4ec" : "#ffedcf");
  sun.intensity = night ? 0.7 : 3;
  scene.background.set(night ? "#263b45" : "#dce2c8");
  $("#night").setAttribute("aria-pressed", String(night));
  render();
};
for (const id of ["house", "shed", "tree", "road", "resident"]) {
  const b = document.createElement("button");
  b.dataset.asset = id;
  b.textContent = {
    house: "House",
    shed: "Shed",
    tree: "Tree",
    road: "Path",
    resident: "Resident",
  }[id];
  b.setAttribute("aria-pressed", "false");
  b.onclick = () => {
    const m = objects.find((o) => o.userData.placement.asset === id);
    overviewMode = false;
    controls.target.copy(m.position);
    controls.target.y = 1;
    camera.zoom = 1.35;
    resize();
    turn(0);
    select(m);
  };
  $("#asset-list").append(b);
}
window.addEventListener("keydown", (e) => {
  if (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    e.target.closest("input,select,textarea,[contenteditable=true]")
  )
    return;
  if (e.code === "KeyQ") turn(-1);
  if (e.code === "KeyE") turn(1);
  if (e.code === "Home") {
    e.preventDefault();
    overviewMode = false;
    focusClearing();
  }
  if (e.code === "Escape") select(null);
});
focusClearing();
render();
