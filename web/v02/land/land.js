import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ASSETS,
  CATEGORIES,
  createAsset,
  compactModel,
  disposeModel,
} from "../library/catalog.js";
import {
  createEditor,
  gallery,
  footprint,
  encode,
  decode,
  validate,
} from "./editor.js";
import {
  MAP_CELLS,
  MAP_METRES,
  CELL_METRES,
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
scene.add(sun, sun.target);
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
const STORAGE = "solar-friends-v02-scene-1";
let initial = gallery(),
  loadWarning = "";
try {
  const saved = localStorage.getItem(STORAGE);
  if (saved) initial = decode(saved);
} catch {
  loadWarning = "Saved scene could not be read. The gallery is loaded instead.";
}
const editor = createEditor(initial);
const objects = [],
  selectable = [];
let placing = null,
  ghost = null;
function sync(selectedId = selected?.userData.placement.id) {
  for (const m of objects) {
    scene.remove(m);
    disposeModel(m);
  }
  objects.length = 0;
  selectable.length = 0;
  for (const record of editor.records) {
    const model = compactModel(createAsset(record.asset));
    model.position.set(
      ...placementPosition(record.column, record.row, footprint(record)),
    );
    model.rotation.y = (record.rotation * Math.PI) / 180;
    model.traverse((o) => {
      if (!o.isMesh) return;
      const hex = o.material.color.getHexString();
      if (hex === "334f4e" || hex === "f5d68b") {
        o.material = o.material.clone();
        o.userData.ownedMaterial = true;
        o.userData.nightGlow = hex === "f5d68b" ? 1.6 : 0.45;
        o.material.emissive.set("#f4b85f");
        o.material.emissiveIntensity = night ? o.userData.nightGlow : 0;
      }
    });
    if (record.asset === "streetlight") {
      const light = new THREE.PointLight("#ffd28a", night ? 7 : 0, 7, 2);
      light.position.set(0.55, 3.18, 0);
      model.add(light);
    }
    model.userData.placement = record;
    model.userData.footprint = footprint(record);
    model.traverse((o) => {
      if (o.isMesh) {
        o.userData.previewRoot = model;
        selectable.push(o);
      }
    });
    scene.add(model);
    objects.push(model);
  }
  select(objects.find((m) => m.userData.placement.id === selectedId) || null);
  $("#undo").disabled = !editor.canUndo;
  $("#redo").disabled = !editor.canRedo;
  $("#scene-count").textContent =
    `${editor.records.length} placed · ${ASSETS.length} asset types`;
  try {
    localStorage.setItem(STORAGE, encode(editor.records));
    $("#save-state").textContent = "Saved on this browser";
  } catch {
    $("#save-state").textContent =
      "Storage unavailable · export to keep your scene";
  }
  render();
}
function clearGhost() {
  if (ghost) {
    scene.remove(ghost);
    ghost.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    ghost = null;
  }
  for (const m of objects) m.visible = true;
}
function cancelPlacement() {
  clearGhost();
  placing = null;
  controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  $("#cancel-place").hidden = true;
  render();
}
function showGhost() {
  clearGhost();
  if (!placing) return;
  const r = placing.record;
  ghost = compactModel(createAsset(r.asset));
  ghost.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.55;
      o.material.depthWrite = false;
    }
  });
  ghost.position.set(...placementPosition(r.column, r.row, footprint(r)));
  ghost.rotation.y = (r.rotation * Math.PI) / 180;
  try {
    validate([r]);
  } catch {
    ghost.traverse((o) => {
      if (o.isMesh) o.material.color.set("#c66448");
    });
  }
  scene.add(ghost);
  if (placing.existing)
    objects.find((m) => m.userData.placement.id === r.id).visible = false;
  render();
}
function startPlacement(record, existing = false) {
  cancelPlacement();
  placing = { record: { ...record }, existing };
  controls.mouseButtons.LEFT = -1;
  $("#cancel-place").hidden = false;
  showGhost();
  toast("Click the land to place · R to rotate · Esc to cancel");
}
function commitPlacement() {
  try {
    const r = placing.record;
    validate([r]);
    if (placing.existing) editor.update(r.id, r);
    else editor.add(r);
    const id = r.id;
    cancelPlacement();
    sync(id);
    toast("Placed");
  } catch (e) {
    toast(e.message);
  }
}
function edit(action) {
  try {
    cancelPlacement();
    action();
    sync();
  } catch (e) {
    toast(e.message);
  }
}
function rotateProp() {
  if (placing) {
    placing.record.rotation = (placing.record.rotation + 90) % 360;
    showGhost();
    return;
  }
  if (selected)
    edit(() =>
      editor.update(selected.userData.placement.id, {
        rotation: (selected.userData.placement.rotation + 90) % 360,
      }),
    );
}
function duplicate() {
  if (selected)
    startPlacement(
      { ...selected.userData.placement, id: crypto.randomUUID() },
      false,
    );
}
function addAsset(id) {
  const def = ASSETS.find((a) => a.id === id);
  startPlacement({
    id: crypto.randomUUID(),
    asset: id,
    column: 30,
    row: 30,
    rotation: 0,
    label: def.name,
  });
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
      "Select a prop to move, rotate, duplicate or delete it. Browse the library to find or place any asset.";
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
    $("#column").value = r.column + 1;
    $("#row").value = r.row + 1;
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
  const first =
    objects.find((m) => m.userData.placement.asset === "house") || objects[0];
  controls.target.copy(first?.position || new THREE.Vector3());
  camera.zoom = 1;
  bearing = 0;
  resize();
  turn(0);
  toast("Asset gallery · choose a category to explore");
}
function overview() {
  controls.target.set(0, 0, 0);
  camera.zoom = 1;
  const aspect = Math.max(320, canvas.clientWidth - 560) / canvas.clientHeight;
  const span = Math.max(110, (MAP_METRES * Math.SQRT2) / aspect) * 1.08;
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
  sun.target.position.copy(controls.target);
  sun.position.copy(controls.target).add(new THREE.Vector3(-20, 45, 25));
  sun.target.updateMatrixWorld();
  const shadowSpan = overviewMode ? 90 : 25;
  Object.assign(sun.shadow.camera, {
    left: -shadowSpan,
    right: shadowSpan,
    top: shadowSpan,
    bottom: -shadowSpan,
    far: 180,
  });
  sun.shadow.camera.updateProjectionMatrix();
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
  if (placing) {
    const point = raycaster.intersectObject(terrain, false)[0]?.point;
    const cell = point && worldCell(point.x, point.z);
    if (cell) {
      placing.record.column = cell.column;
      placing.record.row = cell.row;
      commitPlacement();
    }
    return;
  }
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
  if (placing && cell) {
    placing.record.column = cell.column;
    placing.record.row = cell.row;
    showGhost();
  }
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
$("#clear").onclick = () => {
  cancelPlacement();
  select(null);
};
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
  for (const model of objects)
    model.traverse((o) => {
      if (o.userData.nightGlow)
        o.material.emissiveIntensity = night ? o.userData.nightGlow : 0;
      if (o.isPointLight) o.intensity = night ? 7 : 0;
    });
  $("#night").setAttribute("aria-pressed", String(night));
  render();
};
function focusModel(m) {
  overviewMode = false;
  controls.target.copy(m.position);
  controls.target.y = 1;
  camera.zoom = 1.35;
  resize();
  turn(0);
  select(m);
}
for (const c of CATEGORIES) {
  const o = document.createElement("option");
  o.value = c;
  o.textContent = c;
  $("#category").append(o);
}
function library() {
  const query = $("#search").value.toLowerCase(),
    category = $("#category").value;
  $("#asset-list").replaceChildren();
  for (const def of ASSETS.filter(
    (a) =>
      (!category || a.category === category) &&
      a.name.toLowerCase().includes(query),
  )) {
    const b = document.createElement("button");
    b.dataset.asset = def.id;
    b.textContent = def.name;
    b.title = `${def.category} · ${def.footprint.join(" × ")} cells`;
    b.onclick = () => {
      cancelPlacement();
      const m = objects.find((o) => o.userData.placement.asset === def.id);
      if (m) focusModel(m);
      else addAsset(def.id);
    };
    $("#asset-list").append(b);
  }
}
$("#search").oninput = library;
$("#category").onchange = library;
library();
$("#move").onclick = () =>
  selected && startPlacement(selected.userData.placement, true);
$("#rotate-prop").onclick = rotateProp;
$("#duplicate").onclick = duplicate;
$("#delete").onclick = () =>
  selected && edit(() => editor.remove(selected.userData.placement.id));
$("#place-copy").onclick = () =>
  selected && addAsset(selected.userData.placement.asset);
$("#cancel-place").onclick = cancelPlacement;
$("#position-form").onsubmit = (e) => {
  e.preventDefault();
  if (selected)
    edit(() =>
      editor.update(selected.userData.placement.id, {
        column: Number($("#column").value) - 1,
        row: Number($("#row").value) - 1,
      }),
    );
};
$("#undo").onclick = () => edit(() => editor.undo());
$("#redo").onclick = () => edit(() => editor.redo());
$("#reset").onclick = () => {
  edit(() => editor.replace(gallery()));
  focusClearing();
  toast("Gallery restored · Undo to return to your scene");
};
$("#export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([encode(editor.records)], { type: "application/json" }),
  );
  a.download = "solar-friends-v02-scene.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("#import").onclick = () => $("#scene-file").click();
$("#scene-file").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1000000) throw Error("Scene file is too large.");
    const records = decode(await file.text());
    edit(() => editor.replace(records));
    focusClearing();
  } catch (error) {
    toast(error.message);
  }
  e.target.value = "";
};
window.addEventListener("keydown", (e) => {
  if (
    e.altKey ||
    e.target.closest("input,select,textarea,[contenteditable=true]")
  )
    return;
  if (e.metaKey || e.ctrlKey) {
    if (e.code === "KeyZ") {
      e.preventDefault();
      edit(() => (e.shiftKey ? editor.redo() : editor.undo()));
    }
    if (e.code === "KeyD") {
      e.preventDefault();
      duplicate();
    }
    return;
  }
  if (e.code === "KeyR") rotateProp();
  if (e.code === "KeyM" && selected)
    startPlacement(selected.userData.placement, true);
  if (e.code === "Delete" || e.code === "Backspace") {
    e.preventDefault();
    if (selected) edit(() => editor.remove(selected.userData.placement.id));
  }
  if (e.code === "Enter" && placing) commitPlacement();
  if (e.code === "KeyQ") turn(-1);
  if (e.code === "KeyE") turn(1);
  if (e.code === "Home") {
    e.preventDefault();
    overviewMode = false;
    focusClearing();
  }
  if (e.code === "Escape") {
    if (placing) cancelPlacement();
    else select(null);
  }
});
sync();
focusClearing();
if (loadWarning) toast(loadWarning);
render();
