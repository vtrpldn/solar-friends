import { RESOURCE_GROUPS } from "./resource-groups.js";
import { createFire, animateFire } from "./fire.js";
import { saveKey } from "./modes.js";
import { openingProgress, openingRecap } from "./opening.js";
import { collectAnimals, animateAnimals } from "../library/animal-motion.js";
import { COMMUNITY } from "../library/community-defs.js";
import { resourceIcon, illustrateResources } from "./resource-icons.js";
import { createManagement } from "./management.js";
import { illustrate } from "./ui-art.js";
import { sunlightAt } from "./sunlight.js";
import { createUtilitiesPreview } from "./utilities-preview.js";
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
  repeatProduction,
  queueWater,
  connectUtility,
  sellMaterial,
  storageCapacity,
  storedMaterials,
  restingDoor,
  MATERIALS,
  materialText,
  recipeText,
  materialCount,
  missingMaterials,
  requiredLoads,
  createWeekend,
  createSandbox,
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
  SAVE = saveKey(new URLSearchParams(location.search).get("mode"));
const utilitiesPreview = new URLSearchParams(location.search).has(
  "utilities-preview",
);
const restPreview = new URLSearchParams(location.search).has("rest-preview");
const arrivalPreview =
  utilitiesPreview ||
  restPreview ||
  new URLSearchParams(location.search).has("arrival-preview");
let s = utilitiesPreview
  ? createUtilitiesPreview(
      new URLSearchParams(location.search).has("interactions"),
    )
  : new URLSearchParams(location.search).get("mode") === "sandbox"
    ? createSandbox()
    : createWeekend();
// Optional frozen lighting comparison, only in the unsaved utilities scene.
const lightingPreview =
  utilitiesPreview && new URLSearchParams(location.search).has("lighting-hour");
if (lightingPreview) {
  const hour = Number(
    new URLSearchParams(location.search).get("lighting-hour"),
  );
  s.time =
    (((Number.isFinite(hour) ? Math.max(0, Math.min(24, hour)) : 12) + 24 - 9) *
      60) /
    0.45;
  s.rain = new URLSearchParams(location.search).has("lighting-rain");
}
if (restPreview) for (const resident of s.people) resident.energy = 10;
try {
  if (!arrivalPreview) s = restore(localStorage.getItem(SAVE)) || s;
} catch {}
let speed = 1,
  paused = lightingPreview,
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
controls.minZoom = 0.3;
controls.maxZoom = 6;
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
  far: 190,
});
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
let cloudCover = s.rain ? 1 : 0;
const noonColor = new THREE.Color("#ffe2a8");
const sunsetColor = new THREE.Color("#ffad72");
const overcastColor = new THREE.Color("#d6e3ef");
function updateSunlight(time, dt) {
  cloudCover += ((s.rain ? 1 : 0) - cloudCover) * (1 - Math.exp(-dt / 3));
  const light = sunlightAt(time, cloudCover);
  sun.position.set(light.x, light.y, light.z);
  sun.intensity = light.direct;
  sun.shadow.intensity = light.shadow;
  sun.color
    .copy(noonColor)
    .lerp(sunsetColor, light.warmth)
    .lerp(overcastColor, cloudCover);
  daylight.intensity = light.ambient;
}
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
const utilityLights = [];
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
  const lit = Object.values(sys.nodes)
    .filter((n) =>
      [
        "streetlight",
        "home",
        "kitchen",
        "workshop",
        "shed",
        "warehouse",
        "square",
      ].includes(n.kind),
    )
    .sort(
      (a, b) =>
        world(a.x, a.z).distanceToSquared(controls.target) -
        world(b.x, b.z).distanceToSquared(controls.target),
    )
    .slice(0, 8);
  for (let index = 0; index < 8; index++) {
    let light = utilityLights[index];
    if (!light) {
      light = new THREE.PointLight("#ffcb76", 0, 10, 2);
      scene.add(light);
      utilityLights.push(light);
    }
    const n = lit[index];
    if (!n) {
      light.intensity = 0;
      continue;
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
    if (p.key === "goat-pasture-empty" && p.stocked) id = "goat_pasture";
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
      entry = { root, asset: id, animals: collectAnimals(root) };
      buildings.set(p.id, entry);
    }
    entry.root.position.copy(
      world(p.x + (def.size[0] - 1) / 2, p.z + (def.size[1] - 1) / 2),
    );
    if (def.asset === "fire-circle") {
      if (fraction >= 1 && !entry.fire) {
        entry.fire = createFire();
        entry.root.add(entry.fire.root);
      }
      if (entry.fire) entry.fire.root.visible = fraction >= 1;
    }
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
  $("management-message").textContent = t;
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
    message(
      "Open Our first evening to choose what matters most. You can start with a quick fix or invest in a permanent roof.",
    );
    setPanel("journal");
    persist();
    renderUI();
  };
  $("camps").append(b);
}
for (const [key, d] of Object.entries(PROJECTS)) {
  const b = document.createElement("button");
  b.id = `build-${key}`;
  const count = Object.values(d.materials).reduce((a, b) => a + b, 0);
  b.innerHTML = `<span class="material-warning" aria-hidden="true">!</span><img class="build-art" alt=""/><strong>${d.name}</strong><span class="build-cost">${s.mode === "sandbox" ? "Free" : `${count} materials`} <i>· ${d.size.join("×")}</i></span>`;
  b.setAttribute("aria-label", `${d.name}. ${recipeText(key)}`);
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
  if (e.key === "Escape" && !$("management").open) cancel();
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
function updatePauseButton() {
  $("pause").textContent = paused ? "▶" : "Ⅱ";
  $("pause").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
}
updatePauseButton();
$("pause").onclick = () => {
  paused = !paused;
  updatePauseButton();
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
$("opening-status").onclick = () => {
  if (canFinish(s)) $("meal").click();
  else setPanel("journal");
};
$("opening-town").onclick = () => management.open("resources");
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
  s.stage = "playing";
  s.meal = false;
  for (const r of s.people) {
    if (r.action === "meal") {
      r.action = "idle";
      r.walk = [];
      r.target = null;
    }
  }
  persist();
  renderUI();
};
function askReset() {
  $("reset-dialog").showModal();
}
$("main-menu").onclick = () => {
  persist();
  location.href = "./menu.html";
};
$("sandbox-instant").onclick = () => {
  s.instantBuild = s.instantBuild === false;
  uiSignature = "";
  renderUI();
  persist();
};
$("restart").onclick = askReset;
$("again").onclick = askReset;
$("keep").onclick = () => $("reset-dialog").close();
$("confirm-reset").onclick = () => {
  // pagehide also saves: replace live state before navigating so it cannot resurrect the old camp.
  s = s.mode === "sandbox" ? createSandbox() : createWeekend();
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
  wash: "Washing up",
  toilet: "Using the toilet",
};
let uiSignature = "";
let management;
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
    n.id === -1
      ? "River intake"
      : n.id === 0
        ? "Camp stores"
        : `${PROJECTS[s.projects.find((p) => p.id === n.id).key].name} #${n.id}`,
  ]);
  const kind = $("utility-kind").value;
  const liquidIndex = LIQUIDS.indexOf(kind);
  const compatible = labels.filter(
    ([id]) => liquidIndex < 0 || sys.nodes[id].capacity[liquidIndex] > 0,
  );
  refillSelect("utility-from", compatible);
  refillSelect(
    "utility-to",
    compatible.filter(([id]) => id !== -1),
  );
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
  for (const l of sys.links.filter(
    (l) => (management?.view === "power") === (l.kind === "power"),
  )) {
    const b = document.createElement("button");
    b.textContent = `${l.kind} · ${labels.find(([id]) => id === l.from)?.[1]} → ${labels.find(([id]) => id === l.to)?.[1]}: ${l.work < l.required ? Math.floor((l.work / l.required) * 100) + "% installed" : l.enabled ? "on" : "off"}`;
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
  if (!$("utility-links").children.length)
    $("utility-links").textContent =
      "No connections yet. Choose two buildings to plan the first one.";
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
  $("production-controls").hidden = !$("production").value;
  $("queue-production").disabled = !node || !$("production").value;
  $("repeat-production").disabled = !node || !$("production").value;
  $("repeat-production").textContent = p?.repeat
    ? "Stop repeating"
    : "Keep 24 in stock";
  $("toggle-building").disabled = !node;
  $("toggle-building").textContent = node?.enabled ? "Switch off" : "Switch on";
  const op = p && (s.operations || []).find((o) => o.site === p.id && !o.done);
  $("building-service").textContent = node
    ? `Power ${(node.power * 100).toFixed(0)}%${node.battery ? ` · Battery ${node.charge.toFixed(1)}/${node.battery} kWh` : ""}. ${LIQUIDS.map(
        (k, i) =>
          node.capacity[i]
            ? `${k}: ${node.water[i].toFixed(1)}/${node.capacity[i]}`
            : "",
      )
        .filter(Boolean)
        .join(
          " · ",
        )} ${op ? op.status || "Resident job queued" : p.productionStatus || (p.readyAt > s.time ? `Growing: ${Math.ceil(p.readyAt - s.time)} seconds remaining` : "")}`
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
$("repeat-production").onclick = () => {
  repeatProduction(s, selected, $("production").value);
  uiSignature = "";
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
if (s.mode === "sandbox") $("build-category").value = "Homes";
function filterBuildings() {
  for (const [key, d] of Object.entries(PROJECTS)) {
    const button = $(`build-${key}`);
    button.hidden =
      ($("build-category").value !== "All" &&
        d.category !== $("build-category").value) ||
      !d.name.toLowerCase().includes($("build-search").value.toLowerCase());
    if (!button.hidden) illustrate(button.querySelector("img"), d.asset);
  }
  $("build-list").scrollLeft = 0;
}
$("build-category").onchange = filterBuildings;
$("build-search").oninput = filterBuildings;
let openPanel = null;
function setPanel(panel) {
  if (placing) cancel();
  openPanel = panel;
  if (panel) selected = null;
  document.body.dataset.tray = panel === "build" ? "open" : "closed";
  uiSignature = "";
  renderUI();
}
document.querySelectorAll("[data-panel-toggle]").forEach((button) => {
  button.onclick = () =>
    setPanel(
      openPanel === button.dataset.panelToggle
        ? null
        : button.dataset.panelToggle,
    );
});
document
  .querySelectorAll("[data-close-panel]")
  .forEach((button) => (button.onclick = () => setPanel(null)));
$("toggle-build-list").onclick = () => setPanel(null);
filterBuildings();
function renderUI() {
  const signature = JSON.stringify([
    openPanel,
    s.stage,
    s.opening,
    s.instantBuild,
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
  $("sandbox-instant").hidden = s.mode !== "sandbox";
  $("sandbox-instant").textContent =
    `Instant build: ${s.instantBuild === false ? "off" : "on"}`;
  $("sandbox-instant").setAttribute(
    "aria-pressed",
    String(s.instantBuild !== false),
  );
  document.querySelector("header h1").textContent =
    s.mode === "sandbox" ? "Your sandbox" : "Our little village";
  $("arrival").hidden = active || s.arrivalElapsed < ARRIVAL_DURATION;
  $("skip-arrival").hidden = active || s.arrivalElapsed >= ARRIVAL_DURATION;
  $("village-actions").hidden = !active;
  document.querySelectorAll("[data-panel-toggle]").forEach((button) => {
    const opened = openPanel === button.dataset.panelToggle && !selected;
    button.setAttribute("aria-expanded", String(opened));
    button.classList.toggle("active", opened);
  });
  $("journal").hidden = !active || openPanel !== "journal" || !!selected;
  $("people").hidden = !active || !!selected || openPanel !== "people";
  $("build").hidden =
    !active || s.stage === "evening" || openPanel !== "build" || !!selected;
  const counters = [
    ["money", `R$${s.money}`, "Savings", "resources"],
    ["wood", Math.floor(s.wood), "Timber", "resources"],
    ["meals", s.materials.meals || 0, "Meals", "resources"],
    [
      "power",
      `${Object.values(s.infrastructure?.nodes || {})
        .reduce((a, n) => a + (n.generation || 0), 0)
        .toFixed(1)}`,
      "Power",
      "power",
    ],
    [
      "water",
      Math.floor(s.infrastructure?.nodes[0]?.water[0] || 0),
      "Water",
      "water",
    ],
  ];
  if (!$("supplies").children.length)
    $("supplies").innerHTML = counters
      .map(
        ([icon, value, label, panel]) =>
          `<button class="resource" data-panel="${panel}" title="Open ${panel} management">${resourceIcon(icon)}<b></b><small>${label}</small></button>`,
      )
      .join("");
  illustrateResources($("supplies"));
  counters.forEach((counter, i) => {
    $("supplies").children[i].querySelector("b").textContent =
      s.mode === "sandbox" && i < 3 ? "∞" : counter[1];
    $("supplies").children[i].disabled = !active;
  });
  const minutes = 9 * 60 + Math.floor(s.time * 0.45);
  $("clock").textContent =
    s.stage === "evening"
      ? "Saturday · Evening"
      : `Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const opening = s.opening && !s.opening.complete && active;
  const goals = openingProgress(s, PROJECTS);
  $("opening-plan").hidden = !opening;
  $("opening-status").hidden = !opening;
  $("opening-status").textContent = goals.ready
    ? "✦ Camp is ready · Gather for dinner"
    : `✦ Our first evening · ${goals.count}/3 needs met · Open plan`;
  if (opening) {
    $("opening-needs").innerHTML = [
      ["gathering", "A place to share a meal"],
      ["shelter", "Dry cover for people"],
      ["supplies", "Protected tools and supplies"],
    ]
      .map(([key, label]) => `<p>${goals[key] ? "✓" : "○"} ${label}</p>`)
      .join("");
    $("opening-options").replaceChildren();
    for (const [key, reason] of [
      ["gathering", "Luz: Start with somewhere to sit together."],
      ["rain-tent", "Quick cover · uses the spare tarp"],
      ["shelter", "Lasting shelter · uses six roof sheets"],
      ["tarp-stores", "Quick storage protection · uses the spare tarp"],
      ["covered-stores", "Lasting storage · uses six roof sheets"],
    ]) {
      const need =
        key === "gathering"
          ? "gathering"
          : ["rain-tent", "shelter"].includes(key)
            ? "shelter"
            : "supplies";
      const planned = openingProgress(
        {
          ...s,
          projects: s.projects.map((p) => ({
            ...p,
            work: PROJECTS[p.key].work,
          })),
        },
        PROJECTS,
      );
      if (planned[need]) continue;
      const b = document.createElement("button");
      b.innerHTML = `<strong>${PROJECTS[key].name}</strong><small>${reason}</small><small>${recipeText(key)}</small>`;
      const missing = missingMaterials(s, key);
      if (missing.length) {
        const warning = document.createElement("small");
        warning.textContent = `Need ${missing.join(", ")} · fetch in town`;
        b.append(warning);
      }
      b.title = PROJECTS[key].description;
      b.onclick = () => {
        setPanel(null);
        startPlacement(key);
      };
      $("opening-options").append(b);
    }
  }
  $("objective").textContent =
    s.mode === "sandbox"
      ? "Build freely. Supplies replenish automatically. Toggle Instant build in the catalog to have residents construct your plans. Water and power networks still work normally."
      : opening
        ? goals.ready
          ? "The essentials are covered. Bring everyone together, or keep improving the camp."
          : s.trip
            ? "One friend is fetching supplies. The others can keep building while they are away."
            : s.rain
              ? "The shower is here. Uncovered work is 20% slower; a dry place helps us take better breaks. There is no deadline: finish when you feel ready."
              : s.rainSeen
                ? "The shower has passed. Finish the essentials at your own pace, then gather everyone for dinner."
                : "Iara: Let’s make tonight comfortable. A shower is forecast after a few minutes of work; choose a quick fix or a lasting improvement. There is no single right layout."
        : s.stage === "evening"
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
  $("completed-tasks").replaceChildren();
  const builtCount = s.projects.filter(
    (p) => p.work >= PROJECTS[p.key].work,
  ).length;
  $("completed-panel").hidden = builtCount === 0;
  $("completed-title").textContent = `Around the village · ${builtCount} built`;
  for (const p of s.projects) {
    const d = PROJECTS[p.key],
      div = document.createElement("div");
    div.className = "task";
    const b = document.createElement("button");
    const done = p.work >= d.work;
    div.classList.toggle("complete", done);
    b.innerHTML = `<img alt=""/><span>${d.name}</span><em>${done ? "✓" : Math.floor((p.work / d.work) * 100) + "%"}</em>`;
    illustrate(b.querySelector("img"), d.asset);
    b.onclick = () => {
      selected = p.id;
      renderUI();
    };
    const progress = document.createElement("progress");
    progress.max = d.work;
    progress.value = p.work;
    div.append(b, progress);
    if (!done) {
      const workStatus = document.createElement("small");
      workStatus.className = "task-work-status";
      const workers = s.people.filter(
        (r) => r.job === p.id && r.action === "build",
      ).length;
      workStatus.textContent =
        p.delivered < requiredLoads(p.key)
          ? `Bringing supplies · ${p.delivered}/${requiredLoads(p.key)} loads delivered`
          : workers
            ? `${workers} friends building`
            : "Supplies ready · waiting for a builder";
      div.append(workStatus);
    }
    $(done ? "completed-tasks" : "tasks").append(div);
  }
  $("roster").replaceChildren();
  for (const r of s.people) {
    const div = document.createElement("div");
    div.className = "person";
    const portrait = document.createElement("img");
    portrait.className = "portrait";
    illustrate(portrait, r.id);
    div.dataset.resident = r.id;
    const name = document.createElement("strong");
    name.textContent = r.name;
    name.title = `Good at: ${specialties[r.id]}`;
    const energy = document.createElement("span");
    energy.textContent = `${Math.round(r.energy)}% energy`;
    const status = document.createElement("span");
    status.textContent =
      r.tentPhase === "exit"
        ? "Leaving " +
          (r.restSite
            ? PROJECTS[s.projects.find((p) => p.id === r.restSite).key].name
            : "the tent")
        : r.action === "rest" && !r.tentPhase
          ? "Heading to " +
            (r.restSite
              ? PROJECTS[s.projects.find((p) => p.id === r.restSite).key].name
              : "the tent")
          : r.action === "rest" && r.restSite
            ? "Resting in " +
              PROJECTS[s.projects.find((p) => p.id === r.restSite).key].name
            : r.action === "produce"
              ? PROCESSES[
                  s.operations.find((o) => o.id === r.operation)?.recipe
                ]?.name || "Preparing supplies"
              : (r.action === "relax" && COMMUNITY[r.leisureKind]?.activity) ||
                actionText[r.action] ||
                "Settling in";
    status.className = "resident-status";
    const progress = document.createElement("progress");
    progress.max = 100;
    progress.value = r.energy;
    div.append(portrait, name, energy, status, progress);
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
  $("recap").textContent = s.opening
    ? openingRecap(s, PROJECTS)
    : `Together, you built: ${s.projects
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
      s.mode !== "sandbox" &&
      !PROJECTS[key].repeatable &&
      s.projects.some((p) => p.key === key);
    const missing = missingMaterials(s, key);
    b.title = `${PROJECTS[key].description} Materials: ${recipeText(key)}. ${missing.length ? "Missing: " + missing.join(", ") : "All materials available."}`;
    b.classList.toggle("active", placing === key);
    b.classList.toggle("needs-materials", missing.length > 0);
  }
  renderUtilityUI();
  management?.render();
  const p = s.projects.find((p) => p.id === selected);
  $("selection").hidden = !p || s.stage === "evening";
  if (p) {
    $("selected-name").textContent = PROJECTS[p.key].name;
    illustrate($("selected-art"), PROJECTS[p.key].asset);
    $("selected-state").textContent = finished(s, p.key)
      ? "READY TO USE"
      : `${Math.floor((p.work / PROJECTS[p.key].work) * 100)}% BUILT`;
    const livestock =
      p.key === "coop"
        ? " Housing: 3 hens / 3 places."
        : p.key === "goat_pasture" ||
            (p.key === "goat-pasture-empty" && p.stocked)
          ? " Housing: 2 goats / 2 places."
          : p.key === "goat-pasture-empty"
            ? " Housing: 0 goats / 2 places."
            : "";
    $("selected-desc").textContent =
      `${PROJECTS[p.key].description}${p.work >= PROJECTS[p.key].work ? livestock : ""} Reserved: ${recipeText(p.key)}. Delivered ${p.delivered}/${requiredLoads(p.key)} loads. Labor ${Math.round(p.work * 0.45)}/${Math.round(PROJECTS[p.key].work * 0.45)} person-minutes.`;
    $("priority").disabled = p.work >= PROJECTS[p.key].work;
  }
}
for (const group of RESOURCE_GROUPS) {
  const options = document.createElement("optgroup");
  options.label = group.name;
  for (const id of group.ids) {
    const item = MATERIALS[id];
    if (!item.quantity) continue;
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${materialText(id, item.quantity)} · R$${item.price}`;
    options.append(option);
  }
  if (options.children.length) $("purchase").append(options);
}
management = createManagement({
  state: () => s,
  refresh: () => {
    uiSignature = "";
    renderUI();
    persist();
  },
  inspect: (id) => {
    selected = id;
    const p = s.projects.find((p) => p.id === id);
    if (p) focus(p);
    uiSignature = "";
    renderUI();
  },
  notify: message,
  isPaused: () => paused,
  setPaused: (value) => {
    paused = value;
    updatePauseButton();
  },
});
$("supplies").onclick = (event) => {
  const button = event.target.closest("[data-panel]");
  if (button) management.open(button.dataset.panel);
};
$("purchase").onchange = () => {
  uiSignature = "";
  renderUI();
};
renderUI();
if (s.stage !== "arrival") message(s.log[0] || "Welcome back to your camp.");
const recordPerformance = performanceReadout(renderer);
let animalTime = 0;
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
  if (!paused && !document.hidden) animalTime += dt * speed;
  for (const [id, entry] of buildings)
    if (entry.animals.length)
      animateAnimals(entry.animals, animalTime + id * 2.73);
  for (const [id, entry] of buildings)
    if (entry.fire) animateFire(entry.fire, animalTime + id * 2.73);
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
    g.visible =
      r.action !== "town" &&
      r.tentPhase !== "inside" &&
      !(r.action === "toilet" && r.toiletTime > 0);
    if (r.tentPhase) {
      const door = restingDoor(s, i),
        t = Math.max(0, Math.min(1, (visual.time - r.tentAt) / 1.5));
      const inward =
        r.tentPhase === "exit" ? 1 - t : r.tentPhase === "inside" ? 1 : t;
      const restingBuilding = s.projects.find((p) => p.id === r.restSite);
      const isHome =
        restingBuilding && PROJECTS[restingBuilding.key].kind === "home";
      const recessed = isHome && /veranda|courtyard/.test(restingBuilding.key);
      const travel = isHome ? (recessed ? 1.15 : 0.75) : 1.35;
      // Enter at the authored door, including recessed house verandas.
      g.visible = inward < (isHome ? 0.82 : 0.64);
      g.position.copy(world(door.x, door.z - inward * travel));
      // Duck beneath the ridge while passing through the open tent door.
      g.position.y = 0;
      g.rotation.y = r.tentPhase === "exit" ? 0 : Math.PI;
      animateResident(
        g.rig,
        r.restSite &&
          PROJECTS[s.projects.find((p) => p.id === r.restSite)?.key]?.kind ===
            "home"
          ? "walk"
          : "duck-walk",
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
    if (
      ["build", "produce", "install", "wash"].includes(r.action) &&
      !r.walk.length
    ) {
      const site =
        r.action === "build"
          ? r.job
          : r.action === "wash"
            ? r.washSite
            : r.action === "install"
              ? s.infrastructure.links.find((l) => l.id === r.linkJob)?.from
              : s.operations.find((o) => o.id === r.operation)?.site;
      const p = s.projects.find((p) => p.id === site);
      if (p) g.rotation.y = Math.atan2(p.x + 0.5 - r.x, p.z + 0.5 - r.z);
    }
    const serviceId =
      r.action === "wash"
        ? r.washSite
        : r.action === "produce"
          ? s.operations.find((o) => o.id === r.operation)?.site
          : null;
    const service = s.projects.find((p) => p.id === serviceId);
    const anchor =
      service &&
      {
        workshop: [-0.2, 1.87],
        kitchen: [0.45, 1.87],
        "wash-station": [0, 0.52],
      }[PROJECTS[service.key].kind];
    const offset = new THREE.Vector3();
    if (
      anchor &&
      !r.walk.length &&
      r.z >= service.z + footprint(service)[1] - 0.1
    ) {
      const center = world(
        service.x + (footprint(service)[0] - 1) / 2,
        service.z + (footprint(service)[1] - 1) / 2,
      );
      offset
        .copy(center)
        .add(new THREE.Vector3(anchor[0], 0, anchor[1]))
        .sub(target);
    }
    g.userData.serviceOffset ??= new THREE.Vector3();
    g.userData.serviceOffset.lerp(offset, paused ? 0 : 1 - Math.exp(-dt * 5));
    if (!seated) g.position.add(g.userData.serviceOffset);
    const production =
      r.action === "produce" &&
      PROCESSES[s.operations.find((o) => o.id === r.operation)?.recipe];
    const tending =
      production &&
      [
        "garden",
        "greenhouse",
        "orchard",
        "grove",
        "coop",
        "goat_pasture",
        "compost",
        "apiary",
      ].includes(production.kind);
    const motion = r.walk.length
      ? r.cargo
        ? "carry-walk"
        : "walk"
      : seated
        ? "sit"
        : r.action === "wash"
          ? "wash"
          : tending
            ? "tend"
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
  updateSunlight(visual.time, paused ? 0 : dt);
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
