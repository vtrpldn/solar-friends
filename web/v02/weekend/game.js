import { syncInfrastructure, LIQUIDS } from "./infrastructure.js";
import { createAccessRoad } from "./access-road.js";
import { captureMotion, interpolateMotion } from "./presentation.js";
import { installCameraNavigation } from "./camera-navigation.js";
import { createJimny } from "../library/vehicles.js";
import {
  ARRIVAL_DURATION,
  PARK_TIME,
  arrivalPose,
  vehiclePose,
  arrivalLaneAt,
} from "./arrival.js";
import { createRiver } from "./river.js";
import { riverBankAt } from "./river-layout.js";
import { createTent } from "../library/camping.js";
import { performanceReadout } from "./performance.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  compactModel,
  createAsset,
  ASSETS,
  disposeModel,
} from "../library/catalog.js";
import { createResident, animateResident } from "../residents/rig.js";
import {
  CAMPS,
  PROJECTS,
  PROCESSES,
  footprint,
  queueProduction,
  queueWater,
  connectUtility,
  sellMaterial,
  storageCapacity,
  storedMaterials,
  tentDoor,
  MATERIALS,
  materialText,
  recipeText,
  materialCount,
  missingMaterials,
  requiredLoads,
  createWeekend,
  chooseCamp,
  plan,
  moveProject,
  prioritize,
  supplyRun,
  resolveRain,
  finished,
  canFinish,
  endWeekend,
  tick,
  save,
  restore,
  placementError,
} from "./simulation.js";
const $ = (id) => document.getElementById(id),
  SAVE = "solar-friends-v02-first-weekend-2";
const restPreview = new URLSearchParams(location.search).has("rest-preview");
const arrivalPreview =
  restPreview || new URLSearchParams(location.search).has("arrival-preview");
let s = createWeekend();
if (restPreview) for (const resident of s.people) resident.energy = 10;
try {
  if (!arrivalPreview) s = restore(localStorage.getItem(SAVE)) || s;
} catch {}
let speed = 1,
  paused = false,
  placing = null,
  moving = null,
  selected = null,
  endingDismissed = false,
  lastUI = 0,
  lastSave = 0;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#cbd5ac");
scene.fog = new THREE.Fog("#cbd5ac", 90, 200);
const renderer = new THREE.WebGLRenderer({
  canvas: $("world"),
  antialias: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const camera = new THREE.OrthographicCamera(-26, 26, 20, -20, 0.1, 300);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minZoom = 0.6;
controls.maxZoom = 3;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minPolarAngle = 0.25;
let arrivalCameraFollow = true;
const navigation = installCameraNavigation(camera, controls, {
  home: () => focus(CAMPS.find((c) => c.id === s.camp)),
  onInteract: () => {
    arrivalCameraFollow = false;
  },
});
const daylight = new THREE.HemisphereLight("#fff1cd", "#658658", 2);
scene.add(daylight);
const sun = new THREE.DirectionalLight("#ffe2a8", 3.4);
sun.position.set(-25, 45, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -48,
  right: 48,
  top: 48,
  bottom: -48,
  near: 1,
  far: 130,
});
sun.shadow.normalBias = 0.04;
scene.add(sun);
const mat = (color) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(128, 128),
  mat("#9fad72"),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(compactModel(createAccessRoad()));
const river = createRiver();
scene.add(compactModel(river.root), river.current);
const lowSpot = new THREE.Mesh(
  new THREE.CircleGeometry(4.4, 16),
  new THREE.MeshStandardMaterial({
    color: "#8a9970",
    roughness: 1,
    transparent: true,
    opacity: 0.28,
  }),
);
lowSpot.rotation.x = -Math.PI / 2;
lowSpot.position.set(2, 0.018, -12);
lowSpot.scale.y = 0.65;
lowSpot.receiveShadow = true;
scene.add(lowSpot);
const puddle = lowSpot.clone();
puddle.material = new THREE.MeshStandardMaterial({
  color: "#86aeb0",
  roughness: 0.3,
  transparent: true,
  opacity: 0.5,
});
puddle.position.y = 0.025;
scene.add(puddle);
const grid = new THREE.GridHelper(128, 64, "#b6bd8c", "#b6bd8c");
grid.position.set(1, 0.015, 1);
grid.visible = false;
scene.add(grid);
function world(x, z) {
  return new THREE.Vector3((x - 32) * 2, 0, (z - 32) * 2);
}
function prop(id, x, z, rotation = 0) {
  const g = compactModel(createAsset(id));
  g.position.copy(world(x, z));
  g.rotation.y = rotation;
  scene.add(g);
  return g;
}
// Native trees frame the clearing; every playable square stays walkable.
const native = ASSETS.filter(
  (a) =>
    a.category === "Vegetation" &&
    !/growing|young|sapling|seedling|sprout/.test(a.id) &&
    a.footprint[0] >= 2,
).map((a) => a.id);
const scenery = new THREE.Group();
scene.add(scenery);
for (let i = 0; i < 52; i++) {
  const a = i * 2.3999,
    r = 29 + (i % 5) * 5,
    x = 32 + (Math.cos(a) * r) / 2,
    z = 32 + (Math.sin(a) * r) / 2;
  if (!riverBankAt(x, z, 2) && !arrivalLaneAt((x - 32) * 2, (z - 32) * 2))
    scenery.add(
      prop(native[i % Math.min(native.length, 8)] || "tree", x, z, i),
    );
}
for (const [x, z] of [
  [25, 29],
  [25, 33],
  [27, 28],
])
  scenery.add(prop("tree", x, z));
const entrance = prop("produce-crates", s.stock.x, s.stock.z);
scenery.add(prop("garden-bench", 30, 24));
scene.add(compactModel(scenery));
scene.remove(scenery);
// A simple arrival car and camping tents use the same flat materials and metre scale.
function box(g, w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
const vehicles = [0, 1].map((index) => {
  const model = createJimny(index),
    wheels = model.children.filter((part) => part.userData.wheel);
  for (const wheel of wheels) model.remove(wheel);
  const root = compactModel(model);
  root.add(...wheels);
  const pose = vehiclePose(ARRIVAL_DURATION, index);
  root.position.set(pose.x, 0, pose.z);
  scene.add(root);
  return { root, wheels };
});
const car = vehicles[0].root;
const campGroup = new THREE.Group();
scene.add(campGroup);
let campDrawn = null;
function drawCamp() {
  if (campDrawn === s.camp) return;
  campDrawn = s.camp;
  campGroup.clear();
  if (!s.camp) return;
  const c = CAMPS.find((c) => c.id === s.camp);
  campGroup.position.copy(world(c.x, c.z));
  for (let i = 0; i < 2; i++) {
    const tent = compactModel(createTent(i));
    tent.position.set(i * 3, 0, -3);
    campGroup.add(tent);
  }
}
const border = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(
    [
      [1.5, 1.5],
      [61.5, 1.5],
      [61.5, 61.5],
      [1.5, 61.5],
    ].map(([x, z]) => world(x, z).setY(0.025)),
  ),
  new THREE.LineBasicMaterial({ color: "#e0dfad" }),
);
scene.add(border);
const markers = [];
for (const c of CAMPS) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 2.65, 40),
    new THREE.MeshBasicMaterial({ color: "#fff3ba", side: THREE.DoubleSide }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.copy(world(c.x, c.z));
  m.position.y = 0.03;
  scene.add(m);
  markers.push(m);
}
const actors = s.people.map((r) => {
  const root = createResident(r.id);
  scene.add(root);
  return root;
});
const utilityLines = new THREE.Group();
scene.add(utilityLines);
let utilityDrawing = "";
const utilityLights = new Map();
function drawUtilities() {
  const sys = s.infrastructure;
  if (!sys) return;
  const signature = JSON.stringify(
    sys.links.map((l) => [
      l.id,
      l.enabled,
      l.work >= l.required,
      sys.nodes[l.from].x,
      sys.nodes[l.from].z,
      sys.nodes[l.to].x,
      sys.nodes[l.to].z,
    ]),
  );
  if (signature !== utilityDrawing) {
    utilityDrawing = signature;
    for (const child of [...utilityLines.children]) {
      child.geometry.dispose();
      child.material.dispose();
      utilityLines.remove(child);
    }
    for (const l of sys.links) {
      const a = sys.nodes[l.from],
        b = sys.nodes[l.to];
      const points = [world(a.x, a.z).setY(0.12), world(b.x, b.z).setY(0.12)];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color:
            l.kind === "power"
              ? "#e6bc5c"
              : {
                  fresh: "#73cce5",
                  irrigation: "#6b9c63",
                  greywater: "#97919a",
                  sewage: "#815c48",
                }[l.kind],
          transparent: true,
          opacity: l.enabled && l.work >= l.required ? 0.8 : 0.25,
        }),
      );
      utilityLines.add(line);
    }
  }
  const night = 1 - Math.min(1, (sys.sun || 0) * 4);
  daylight.intensity = 1.1 + (1 - night) * 0.9;
  sun.intensity = 0.25 + (1 - night) * 3.15;
  for (const n of Object.values(sys.nodes)) {
    if (
      ![
        "streetlight",
        "home",
        "kitchen",
        "workshop",
        "shed",
        "warehouse",
        "square",
      ].includes(n.kind)
    )
      continue;
    let light = utilityLights.get(n.id);
    if (!light) {
      light = new THREE.PointLight("#ffcb76", 0, 10, 2);
      scene.add(light);
      utilityLights.set(n.id, light);
    }
    const p = s.projects.find((p) => p.id === n.id);
    if (!p) continue;
    light.position.copy(
      world(
        p.x + (PROJECTS[p.key].size[0] - 1) / 2,
        p.z + (PROJECTS[p.key].size[1] - 1) / 2,
      ),
    );
    light.position.y = n.kind === "streetlight" ? 2.7 : 1.6;
    light.intensity = night * (n.power || 0) * 12;
  }
}
const buildings = new Map();
const assets = new Set(ASSETS.map((a) => a.id));
function syncBuildings() {
  for (const p of s.projects) {
    const def = PROJECTS[p.key],
      fraction = p.work / def.work;
    let id =
      p.key === "gathering" && fraction < 0.35 ? "produce-crates" : def.asset;
    if (
      fraction < 1 &&
      assets.has(`${id}-construction-${fraction < 0.5 ? 0 : 1}`)
    )
      id += `-construction-${fraction < 0.5 ? 0 : 1}`;
    let entry = buildings.get(p.id);
    if (!entry || entry.asset !== id) {
      if (entry) {
        scene.remove(entry.root);
        disposeModel(entry.root);
      }
      const root = prop(
        id,
        p.x + (def.size[0] - 1) / 2,
        p.z + (def.size[1] - 1) / 2,
      );
      root.userData.projectId = p.id;
      entry = { root, asset: id };
      buildings.set(p.id, entry);
    }
    entry.root.position.copy(
      world(p.x + (def.size[0] - 1) / 2, p.z + (def.size[1] - 1) / 2),
    );
    if (p.key === "gathering" && s.meal && !entry.meal) {
      for (let i = 0; i < 5; i++) {
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.025, 10),
          mat("#e7d5ad"),
        );
        plate.position.set(((i % 3) - 1) * 0.65, 0.86, i < 3 ? 0.25 : -0.25);
        entry.root.add(plate);
        const food = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.09, 0),
          mat("#c7924c"),
        );
        food.position.copy(plate.position).add(new THREE.Vector3(0, 0.06, 0));
        entry.root.add(food);
      }
      entry.meal = true;
    }
    if (p.key === "gathering") {
      entry.root.visible = true;
      if (fraction >= 1 && !entry.tarp) {
        const tarp = new THREE.Group();
        for (const x of [-1.8, 1.8])
          for (const z of [-1.8, 1.8])
            box(tarp, 0.08, 2.6, 0.08, "#8b694a", x, 1.3, z);
        const roof = box(tarp, 3.8, 0.06, 3.8, "#d8bf85", 0, 2.7, 0);
        roof.rotation.z = 0.06;
        entry.root.add(tarp);
        entry.tarp = tarp;
      }
    }
  }
}
const ghost = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({
    color: "#d9eda5",
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  }),
);
ghost.rotation.x = -Math.PI / 2;
ghost.visible = false;
scene.add(ghost);
const drops = new THREE.BufferGeometry(),
  rainPoints = new Float32Array(600 * 3);
for (let i = 0; i < 600; i++) {
  rainPoints[i * 3] = (Math.random() - 0.5) * 50;
  rainPoints[i * 3 + 1] = Math.random() * 20;
  rainPoints[i * 3 + 2] = (Math.random() - 0.5) * 50;
}
drops.setAttribute("position", new THREE.BufferAttribute(rainPoints, 3));
const rainMesh = new THREE.Points(
  drops,
  new THREE.PointsMaterial({
    color: "#dbe8ec",
    size: 0.09,
    transparent: true,
    opacity: 0.7,
  }),
);
scene.add(rainMesh);
function focus(c) {
  const target = c ? world(c.x, c.z) : world(32, 31);
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(32, 35, 32));
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.update();
}
focus(CAMPS.find((c) => c.id === s.camp));
if (s.stage === "arrival" && s.arrivalElapsed < ARRIVAL_DURATION) {
  const pose = arrivalPose(s.arrivalElapsed, 0).car;
  focus({ x: pose.x / 2 + 32, z: pose.z / 2 + 32 });
}
function resize() {
  const a = innerWidth / innerHeight;
  camera.left = -23 * a;
  camera.right = 23 * a;
  camera.top = 23;
  camera.bottom = -23;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();
function message(t) {
  if ($("message").textContent !== t) $("message").textContent = t;
}
function persist() {
  if (arrivalPreview) return;
  try {
    localStorage.setItem(SAVE, save(s));
  } catch {
    message(
      "Progress cannot be saved in this browser. Keep this tab open to continue.",
    );
  }
}
function cancel() {
  placing = null;
  moving = null;
  ghost.visible = false;
  $("cancel").hidden = true;
  grid.visible = false;
  renderUI();
}
function startPlacement(key, id = null) {
  placing = key;
  moving = id;
  ghost.visible = false;
  $("cancel").hidden = false;
  grid.visible = true;
  message("Click a square in the central clearing. Esc cancels.");
  renderUI();
}
for (const c of CAMPS) {
  const b = document.createElement("button");
  b.innerHTML = `<strong>${c.name}</strong><span>${c.description}</span>`;
  b.onmouseenter = () => focus(c);
  b.onclick = () => {
    chooseCamp(s, c.id);
    focus(c);
    message("Choose Gathering place below, then click where you want it.");
    persist();
    renderUI();
  };
  $("camps").append(b);
}
for (const [key, d] of Object.entries(PROJECTS)) {
  const b = document.createElement("button");
  b.id = `build-${key}`;
  b.innerHTML = `<strong>${d.name}</strong><span>${recipeText(key)}</span>`;
  b.title = d.description;
  b.dataset.category = d.category;
  b.onclick = () => startPlacement(key);
  $("build-list").append(b);
}
const ray = new THREE.Raycaster(),
  mouse = new THREE.Vector2();
let down = null,
  cell = null;
function hit(e) {
  mouse.set(
    (e.clientX / innerWidth) * 2 - 1,
    1 - (e.clientY / innerHeight) * 2,
  );
  ray.setFromCamera(mouse, camera);
  return ray.intersectObject(ground)[0]?.point;
}
$("world").addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY };
});
$("world").addEventListener("pointermove", (e) => {
  if (!placing) return;
  const p = hit(e);
  if (!p) return;
  cell = { x: Math.round(p.x / 2 + 32), z: Math.round(p.z / 2 + 32) };
  const size = PROJECTS[placing].size;
  ghost.scale.set(size[0] / 2, size[1] / 2, 1);
  ghost.position.copy(
    world(cell.x + (size[0] - 1) / 2, cell.z + (size[1] - 1) / 2),
  );
  ghost.position.y = 0.04;
  ghost.visible = true;
  const error = placementError(s, placing, cell.x, cell.z, moving);
  ghost.material.color.set(error ? "#c26847" : "#d9eda5");
});
$("world").addEventListener("pointerup", (e) => {
  if (
    !down ||
    e.button !== 0 ||
    Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6
  )
    return;
  const p = hit(e);
  if (!p) return;
  const x = Math.round(p.x / 2 + 32),
    z = Math.round(p.z / 2 + 32);
  if (placing) {
    const error = moving
      ? moveProject(s, moving, x, z)
      : plan(s, placing, x, z);
    if (error) {
      message(error);
      return;
    }
    cancel();
    message(s.log[0]);
    syncBuildings();
    persist();
    renderUI();
  } else {
    selected =
      s.projects.find(
        (p) =>
          x >= p.x &&
          x < p.x + footprint(p)[0] &&
          z >= p.z &&
          z < p.z + footprint(p)[1],
      )?.id || null;
    renderUI();
  }
});
$("priority").onclick = () => {
  prioritize(s, selected);
  message(s.log[0]);
  renderUI();
};
$("move").onclick = () => {
  const p = s.projects.find((p) => p.id === selected);
  if (p) startPlacement(p.key, p.id);
};
$("close-selection").onclick = () => {
  selected = null;
  renderUI();
};
$("cancel").onclick = cancel;
addEventListener("keydown", (e) => {
  if (e.key === "Escape") cancel();
});
$("town").onclick = () => {
  if (supplyRun(s, $("purchase").value)) {
    message(s.log[0]);
    persist();
    renderUI();
  }
};
$("boards").onclick = () => {
  if (resolveRain(s, "boards")) {
    message(s.log[0]);
    renderUI();
  }
};
$("uphill").onclick = () => {
  resolveRain(s, "move");
  message(s.log[0]);
  renderUI();
};
$("skip-arrival").onclick = () => {
  s.arrivalElapsed = ARRIVAL_DURATION;
  previousMotion = captureMotion(s);
  accumulator = 0;
  focus();
  message("Choose a campsite to begin.");
  renderUI();
  persist();
};
$("pause").onclick = () => {
  paused = !paused;
  $("pause").textContent = paused ? "▶" : "Ⅱ";
  $("pause").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
};
$("speed").onclick = () => {
  speed = speed === 1 ? 4 : 1;
  $("speed").textContent = `${speed}×`;
};
$("home").onclick = () => focus(CAMPS.find((c) => c.id === s.camp));
$("river-view").onclick = () => focus({ x: 20, z: 38 });
$("rotate-left").onclick = () => navigation.rotate(-Math.PI / 2);
$("rotate-right").onclick = () => navigation.rotate(Math.PI / 2);
$("zoom-in").onclick = () => navigation.zoom(1.2);
$("zoom-out").onclick = () => navigation.zoom(1 / 1.2);
$("grid").onclick = () => {
  grid.visible = !grid.visible;
  $("grid").setAttribute("aria-pressed", String(grid.visible));
};
$("meal").onclick = () => {
  if (endWeekend(s)) {
    endingDismissed = false;
    cancel();
    persist();
    renderUI();
  }
};
$("continue").onclick = () => {
  endingDismissed = true;
  renderUI();
};
function askReset() {
  $("reset-dialog").showModal();
}
$("restart").onclick = askReset;
$("again").onclick = askReset;
$("keep").onclick = () => $("reset-dialog").close();
$("confirm-reset").onclick = () => {
  // pagehide also saves: replace live state before navigating so it cannot resurrect the old camp.
  s = createWeekend();
  persist();
  location.reload();
};
const specialties = {
  iara: "All-rounder",
  bento: "Building",
  luz: "Camp setup",
  caua: "Water systems",
  nina: "Sanitation",
};
const actionText = {
  idle: "Taking in the land",
  collect: "Collecting materials",
  carry: "Carrying supplies",
  walk: "Walking to the project",
  build: "Building",
  produce: "Preparing supplies",
  install: "Installing utilities",
  "fetch-water": "Fetching water",
  blocked: "Waiting for supplies or utilities",
  rest: "Resting in the tent",
  relax: "Enjoying the clearing",
  look: "Taking in the surroundings",
  stretch: "Stretching their legs",
  chat: "Having a chat",
  stroll: "Taking a little walk",
  breathe: "Taking a quiet moment",
  town: "Supply run in town",
  meal: "Sharing our first evening",
  wash: "Washing up at the water tank",
};
let uiSignature = "";
function refillSelect(id, options) {
  const el = $(id),
    value = el.value,
    html = options
      .map(([key, label]) => `<option value="${key}">${label}</option>`)
      .join("");
  if (el.dataset.options !== html) {
    el.innerHTML = html;
    el.dataset.options = html;
    if (options.some(([key]) => String(key) === value)) el.value = value;
  }
}
function renderUtilityUI() {
  const sys = syncInfrastructure(s, PROJECTS),
    nodes = Object.values(sys.nodes);
  const labels = nodes.map((n) => [
    n.id,
    n.id === 0
      ? "Camp stores"
      : `${PROJECTS[s.projects.find((p) => p.id === n.id).key].name} #${n.id}`,
  ]);
  refillSelect("utility-from", [[-1, "River (untreated)"], ...labels]);
  refillSelect("utility-to", labels);
  const generation = nodes.reduce((a, n) => a + (n.generation || 0), 0),
    demand = nodes.reduce((a, n) => a + (n.demand || 0), 0),
    stored = nodes.reduce((a, n) => a + n.charge, 0),
    capacity = nodes.reduce((a, n) => a + n.battery, 0);
  const liquids = LIQUIDS.map(
    (key, i) =>
      `${Math.floor(nodes.reduce((a, n) => a + n.water[i], 0))} ${key}`,
  ).join(" · ");
  $("utility-summary").textContent =
    `Power: ${generation.toFixed(1)} kW generated / ${demand.toFixed(1)} kW requested. Battery ${stored.toFixed(1)}/${capacity} kWh. Water: ${liquids}.${sys.thirst ? " Drinking water is empty! Fetch, filter and deliver water to camp." : ""}${sys.hungry ? " Food is empty. Buy ingredients or grow and cook food." : ""}${sys.sanitationBlocked ? " Sewage storage is full. Connect treatment." : ""}`;
  $("utility-links").replaceChildren();
  for (const l of sys.links) {
    const b = document.createElement("button");
    b.textContent = `${l.kind} #${l.from} → #${l.to}: ${l.work < l.required ? Math.floor((l.work / l.required) * 100) + "% installed" : l.enabled ? "on" : "off"}`;
    b.onclick = () => {
      l.enabled = !l.enabled;
      persist();
      renderUI();
    };
    $("utility-links").append(b);
    const remove = document.createElement("button");
    remove.textContent = "Remove connection";
    remove.onclick = () => {
      sys.links = sys.links.filter((item) => item.id !== l.id);
      persist();
      renderUI();
    };
    $("utility-links").append(remove);
  }
  const p = s.projects.find((p) => p.id === selected),
    node = p && sys.nodes[p.id];
  refillSelect(
    "production",
    p
      ? Object.entries(PROCESSES)
          .filter(([, d]) => d.kind === PROJECTS[p.key].kind)
          .map(([id, d]) => [id, d.name])
      : [],
  );
  $("queue-production").disabled = !node || !$("production").value;
  $("toggle-building").disabled = !node;
  $("toggle-building").textContent = node?.enabled ? "Switch off" : "Switch on";
  const op = p && (s.operations || []).find((o) => o.site === p.id && !o.done);
  $("building-service").textContent = node
    ? `Power ${(node.power * 100).toFixed(0)}% · Battery ${node.charge.toFixed(1)}/${node.battery}. ${LIQUIDS.map(
        (k, i) =>
          node.capacity[i]
            ? `${k}: ${node.water[i].toFixed(1)}/${node.capacity[i]}`
            : "",
      )
        .filter(Boolean)
        .join(" · ")} ${op ? op.status || "Resident job queued" : ""}`
    : "";
}
$("connect-utility").onclick = () => {
  message(
    connectUtility(
      s,
      $("utility-kind").value,
      $("utility-from").value,
      $("utility-to").value,
    ) || "Connection planned. Residents will install it.",
  );
  persist();
  renderUI();
};
$("haul-water").onclick = () => {
  message(
    queueWater(
      s,
      $("utility-from").value,
      $("utility-to").value,
      $("utility-kind").value,
    ) || "Water carrying job queued.",
  );
  persist();
  renderUI();
};
$("queue-production").onclick = () => {
  message(
    queueProduction(s, selected, $("production").value) ||
      "Resident production job queued.",
  );
  persist();
  renderUI();
};
$("toggle-building").onclick = () => {
  const node = s.infrastructure.nodes[selected];
  if (node) node.enabled = !node.enabled;
  persist();
  renderUI();
};
$("sell").onclick = () => {
  message(
    sellMaterial(s, $("purchase").value)
      ? "Surplus sold at half the purchase price."
      : "Not enough available supplies to sell.",
  );
  persist();
  renderUI();
};
const categories = [
  "First camp",
  ...new Set(
    Object.values(PROJECTS)
      .map((d) => d.category)
      .filter((c) => c !== "First camp"),
  ),
  "All",
];
refillSelect(
  "build-category",
  categories.map((c) => [c, c]),
);
function filterBuildings() {
  for (const [key, d] of Object.entries(PROJECTS))
    $(`build-${key}`).hidden =
      ($("build-category").value !== "All" &&
        d.category !== $("build-category").value) ||
      !d.name.toLowerCase().includes($("build-search").value.toLowerCase());
}
$("build-category").onchange = filterBuildings;
$("build-search").oninput = filterBuildings;
$("toggle-build-list").onclick = () => {
  $("build-list").hidden = !$("build-list").hidden;
  $("toggle-build-list").textContent = $("build-list").hidden
    ? "Show catalog"
    : "Hide catalog";
};
filterBuildings();
function renderUI() {
  const signature = JSON.stringify([
    s.stage,
    s.arrivalElapsed < ARRIVAL_DURATION,
    s.camp,
    s.money,
    s.wood,
    s.materials,
    s.infrastructure && [
      Object.values(s.infrastructure.nodes).map((n) => [
        n.id,
        n.enabled,
        Math.round(n.charge * 10),
        n.water.map((v) => Math.floor(v)),
        Math.round(n.power * 10),
      ]),
      s.infrastructure.links.map((l) => [l.id, Math.floor(l.work), l.enabled]),
    ],
    s.operations?.map((o) => [o.id, o.done, Math.floor(o.work), o.status]),
    $("purchase").value,
    Math.floor(s.time * 0.45),
    s.trip && Math.ceil(s.trip.left),
    s.rainSeen,
    s.rainResolved,
    selected,
    placing,
    endingDismissed,
    s.log,
    s.people.map((r) => [r.action, r.tentPhase, Math.round(r.energy)]),
    s.projects.map((p) => [
      p.id,
      Math.floor((p.work / PROJECTS[p.key].work) * 100),
    ]),
  ]);
  if (signature === uiSignature) return;
  uiSignature = signature;
  const active = s.stage !== "arrival";
  $("arrival").hidden = active || s.arrivalElapsed < ARRIVAL_DURATION;
  $("skip-arrival").hidden = active || s.arrivalElapsed >= ARRIVAL_DURATION;
  $("journal").hidden = !active;
  $("people").hidden = !active || !!selected;
  $("build").hidden = !active || s.stage === "evening";
  $("supplies").textContent =
    `R$${s.money} shared savings · ${s.wood} timber available`;
  const minutes = 9 * 60 + Math.floor(s.time * 0.45);
  $("clock").textContent =
    s.stage === "evening"
      ? "Saturday · Evening"
      : `Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  $("objective").textContent =
    s.stage === "evening"
      ? "Tools away. Take a moment to enjoy what you made together."
      : !finished(s, "gathering")
        ? "First, make somewhere to sit and recover. Then choose one practical improvement."
        : canFinish(s)
          ? "We have a gathering place and a practical improvement. Keep building, or call everyone for dinner."
          : s.trip
            ? "Our camp is ready. Wait for our friend to return before sharing dinner, or keep improving the camp."
            : s.rainSeen && !s.rainResolved
              ? "A roof is taking shape. Keep the supplies dry before calling everyone for dinner."
              : "Choose what helps us stay: water storage, a roof, or a private toilet.";
  $("tasks").replaceChildren();
  for (const p of s.projects) {
    const d = PROJECTS[p.key],
      div = document.createElement("div");
    div.className = "task";
    const b = document.createElement("button");
    b.textContent = `${p.work >= d.work ? "✓ " : ""}${d.name} · ${Math.floor((p.work / d.work) * 100)}%`;
    b.onclick = () => {
      selected = p.id;
      renderUI();
    };
    const progress = document.createElement("progress");
    progress.max = d.work;
    progress.value = p.work;
    div.append(b, progress);
    $("tasks").append(div);
  }
  $("roster").replaceChildren();
  for (const r of s.people) {
    const div = document.createElement("div");
    div.className = "person";
    const name = document.createElement("strong");
    name.textContent = r.name;
    name.title = `Good at: ${specialties[r.id]}`;
    const energy = document.createElement("span");
    energy.textContent = `${Math.round(r.energy)}% energy`;
    const status = document.createElement("span");
    status.textContent =
      r.tentPhase === "exit"
        ? "Leaving the tent"
        : r.action === "rest" && !r.tentPhase
          ? "Heading to the tent"
          : actionText[r.action] || "Settling in";
    status.style.gridColumn = "1 / -1";
    const progress = document.createElement("progress");
    progress.max = 100;
    progress.value = r.energy;
    div.append(name, energy, status, progress);
    $("roster").append(div);
  }
  const purchase = MATERIALS[$("purchase").value];
  $("town").textContent =
    `Fetch ${materialText($("purchase").value, purchase.quantity)} · R$${purchase.price}`;
  $("town").disabled =
    !!s.trip || s.money < purchase.price || s.stage !== "playing";
  $("inventory").textContent = Object.keys(MATERIALS)
    .map((id) => materialText(id, materialCount(s, id)))
    .join(" · ");
  $("sell").disabled =
    materialCount(s, $("purchase").value) < purchase.quantity ||
    !purchase.quantity;
  $("trip").textContent = s.trip
    ? `${s.people.find((r) => r.id === s.trip.person).name} returns in ${Math.ceil(s.trip.left)} seconds.`
    : `Storage: ${Math.round(storedMaterials(s))}/${storageCapacity(s)} units. Buy essentials or sell locally produced surplus.`;
  $("rain").hidden = !s.rainSeen || s.rainResolved;
  $("boards").disabled = s.wood < 2;
  $("meal").hidden = !canFinish(s) || s.stage !== "playing";
  $("ending").hidden = s.stage !== "evening" || endingDismissed;
  $("recap").textContent = `Together, you built: ${s.projects
    .filter((p) => finished(s, p.key))
    .map((p) => PROJECTS[p.key].name.toLowerCase())
    .join(
      ", ",
    )}. ${finished(s, "shelter") ? "There’s a dry roof for tonight." : "For tonight, the tents will do."} ${finished(s, "toilet") ? "Everyone has a little privacy." : ""} R$${s.money} remains for next time.`;
  $("log").replaceChildren(
    ...s.log.map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    }),
  );
  for (const key of Object.keys(PROJECTS)) {
    const b = $(`build-${key}`);
    b.disabled =
      !PROJECTS[key].repeatable && s.projects.some((p) => p.key === key);
    const missing = missingMaterials(s, key);
    b.title = `${PROJECTS[key].description} ${missing.length ? "Missing: " + missing.join(", ") : "All materials available."}`;
    b.classList.toggle("active", placing === key);
  }
  renderUtilityUI();
  const p = s.projects.find((p) => p.id === selected);
  $("selection").hidden = !p || s.stage === "evening";
  if (p) {
    $("selected-name").textContent = PROJECTS[p.key].name;
    $("selected-state").textContent = finished(s, p.key)
      ? "READY TO USE"
      : `${Math.floor((p.work / PROJECTS[p.key].work) * 100)}% BUILT`;
    $("selected-desc").textContent =
      `${PROJECTS[p.key].description} Reserved: ${recipeText(p.key)}. Delivered ${p.delivered}/${requiredLoads(p.key)} loads. Labor ${Math.round(p.work * 0.45)}/${Math.round(PROJECTS[p.key].work * 0.45)} person-minutes.`;
    $("priority").disabled = p.work >= PROJECTS[p.key].work;
  }
}
for (const [id, item] of Object.entries(MATERIALS).filter(
  ([, item]) => item.quantity > 0,
)) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = `${materialText(id, item.quantity)} · R$${item.price}`;
  $("purchase").append(option);
}
$("purchase").onchange = () => renderUI();
renderUI();
if (s.stage !== "arrival") message(s.log[0] || "Welcome back to your camp.");
const recordPerformance = performanceReadout(renderer);
let previous = performance.now(),
  accumulator = 0,
  latestMessage = s.log[0];
let previousMotion = captureMotion(s);
function frame(now) {
  const dt = Math.min((now - previous) / 1000, 0.1);
  previous = now;
  if (!paused && !document.hidden) {
    accumulator += dt * speed;
    while (accumulator >= 0.1) {
      previousMotion = captureMotion(s);
      tick(s, 0.1);
      accumulator -= 0.1;
    }
  }
  const visual = interpolateMotion(previousMotion, s, accumulator / 0.1);
  drawCamp();
  syncBuildings();
  entrance.position.copy(world(s.stock.x, s.stock.z));
  vehicles.forEach(
    (vehicle, index) => (vehicle.root.visible = index !== 0 || !s.trip),
  );
  const arriving = s.stage === "arrival" && s.arrivalElapsed < ARRIVAL_DURATION;
  if (s.stage === "arrival") {
    const pose = arrivalPose(visual.arrivalElapsed, 0);
    for (const [index, vehicle] of vehicles.entries()) {
      const drive = vehiclePose(visual.arrivalElapsed, index);
      vehicle.root.position.set(drive.x, 0, drive.z);
      vehicle.root.rotation.y = drive.yaw;
      for (const wheel of vehicle.wheels) {
        wheel.rotation.set(0, 0, Math.PI / 2);
        wheel.rotateY((drive.z + 58) / 0.41);
      }
    }
    if (arriving) {
      if (arrivalCameraFollow) {
        controls.target.lerp(car.position, 1 - Math.exp(-dt * 7));
        camera.position
          .copy(controls.target)
          .add(new THREE.Vector3(24, 26, 24));
      }
      message(
        s.arrivalElapsed < PARK_TIME
          ? "There it is. Our own little piece of land."
          : "We’re here! Everyone out—let’s take a look.",
      );
    } else if (
      !$("arrival").hidden &&
      $("message").textContent.startsWith("We’re here")
    ) {
      if (arrivalCameraFollow) focus();
      message("Choose a campsite to begin.");
    }
  }
  entrance.visible = !arriving;
  markers.forEach((m) => (m.visible = s.stage === "arrival" && !arriving));
  for (const [i, r] of s.people.entries()) {
    const g = actors[i];
    if (arriving) {
      const pose = arrivalPose(visual.arrivalElapsed, i);
      g.visible = pose.visible;
      g.position.set(pose.x, pose.y, pose.z);
      g.rotation.y = pose.yaw;
      animateResident(
        g.rig,
        pose.walking ? "walk" : "idle",
        visual.arrivalElapsed + i * 0.3,
        paused ? 0 : dt * speed,
      );
      continue;
    }
    g.visible = r.action !== "town" && r.tentPhase !== "inside";
    if (r.tentPhase) {
      const door = tentDoor(s, i),
        t = Math.max(0, Math.min(1, (visual.time - r.tentAt) / 1.5));
      const inward =
        r.tentPhase === "exit" ? 1 - t : r.tentPhase === "inside" ? 1 : t;
      // The interior is hidden; reveal the resident only at the open doorway.
      g.visible = inward < 0.64;
      g.position.copy(world(door.x, door.z - inward * 1.35));
      // Duck beneath the ridge while passing through the open tent door.
      g.position.y = 0;
      g.rotation.y = r.tentPhase === "exit" ? 0 : Math.PI;
      animateResident(
        g.rig,
        "duck-walk",
        visual.time + i * 0.7,
        paused ? 0 : dt * speed,
      );
      continue;
    }
    const target = world(visual.people[i].x, visual.people[i].z),
      dx = target.x - g.position.x,
      dz = target.z - g.position.z;
    if (r.walk.length && Math.hypot(dx, dz) < 1)
      g.userData.walkTime =
        (g.userData.walkTime || 0) + Math.hypot(dx, dz) / 1.9;
    let desiredYaw = g.rotation.y;
    if (Math.hypot(dx, dz) > 0.001) desiredYaw = Math.atan2(dx, dz);
    else if (r.lookAt) {
      const friend = s.people.find((p) => p.id === r.lookAt);
      if (friend) desiredYaw = Math.atan2(friend.x - r.x, friend.z - r.z);
    }
    const turn = Math.atan2(
      Math.sin(desiredYaw - g.rotation.y),
      Math.cos(desiredYaw - g.rotation.y),
    );
    g.rotation.y += turn * (1 - Math.exp(-dt * 9));
    const gathering = s.projects.find(
      (p) => p.key === "gathering" && finished(s, "gathering"),
    );
    let seated = false;
    if (r.action === "meal" && !r.walk.length && gathering) {
      const seat = world(gathering.x + 0.5, gathering.z + 0.5);
      seat.x += ((i % 3) - 1) * 0.65;
      seat.z += i < 3 ? 0.85 : -0.85;
      g.position.lerp(seat, Math.min(1, dt * 3));
      seated = g.position.distanceTo(seat) < 0.15;
      g.rotation.y = i < 3 ? Math.PI : 0;
    } else g.position.copy(target);
    if (r.action === "build" && !r.walk.length) {
      const p = s.projects.find((p) => p.id === r.job);
      if (p) g.rotation.y = Math.atan2(p.x + 0.5 - r.x, p.z + 0.5 - r.z);
    }
    const motion = r.walk.length
      ? r.cargo
        ? "carry-walk"
        : "walk"
      : seated
        ? "sit"
        : r.action === "wash"
          ? "wash"
          : ["build", "produce", "install"].includes(r.action)
            ? "work"
            : r.action === "rest"
              ? "idle"
              : ["look", "stretch", "chat", "breathe"].includes(r.action)
                ? r.action
                : "idle";
    animateResident(
      g.rig,
      motion,
      (r.walk.length ? g.userData.walkTime || 0 : visual.time) + i * 0.7,
      paused ? 0 : dt * speed,
    );
  }
  river.update(visual.time);
  rainMesh.visible = s.rain;
  puddle.visible = s.rain && s.camp === "entrance";
  if (s.rain) {
    for (let i = 0; i < 600; i++) {
      rainPoints[i * 3 + 1] -= dt * 12;
      if (rainPoints[i * 3 + 1] < 0) rainPoints[i * 3 + 1] = 20;
    }
    drops.attributes.position.needsUpdate = true;
  }
  const evening = s.stage === "evening";
  sun.color.set(evening ? "#ffb36e" : s.rain ? "#d6e3ef" : "#ffe2a8");
  sun.intensity = evening ? 2.2 : s.rain ? 1.5 : 3.4;
  if (now - lastUI > 450) {
    if (s.log[0] !== latestMessage) {
      latestMessage = s.log[0];
      if (!placing) message(latestMessage);
    }
    renderUI();
    lastUI = now;
  }
  if (!document.hidden && now - lastSave > 3000) {
    persist();
    lastSave = now;
  }
  navigation.update(dt);
  controls.update();
  drawUtilities();
  renderer.render(scene, camera);
  recordPerformance(now, arriving ? visual.arrivalElapsed : visual.time);
  requestAnimationFrame(frame);
}
addEventListener("pagehide", persist);
requestAnimationFrame(frame);
