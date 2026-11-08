import {saveSlots} from "./save-slots.js";
import {installSaveDialog} from "./save-dialog.js";
import {createCapybaraVisitors} from "./capybaras.js";
import { constructionStatus } from "./construction-logistics.js";
import { BUILD_CATEGORIES, buildingCategory, inBuildCategory } from "./build-categories.js";
import {createResourceTrends,resourceSnapshot,formatTrend} from './resource-trends.js';
import {materialTooltip} from './material-tooltip.js';
import {createWildlife} from './wildlife.js';
import {installAudio} from './audio.js';
import {settingsFor,BIOMES,richnessFactor} from './world-settings.js';
import {beginArrival} from './simulation.js';
import {depositCapacity} from './land-layout.js';
import {profileFor,friendshipLabel} from './resident-personality.js';
import { needMeters } from "./resident-needs.js";
import { drapeRoadGeometry } from "./road-surface.js";
import { terraform } from "./terraform.js";
import { roadLine } from "./placement-helpers.js";
import { prepareHouseLighting, updateHouseLighting } from "./house-lighting.js";
import { autoConnectUtilities } from "./auto-utilities.js";
import { townCarPose } from "./town-trip.js";
import { accessRoadAt } from "./road-layout.js";
import { MAP_CELLS, MAP_HALF, CELL_MIN, CELL_MAX } from "./map-size.js";
import { fitTerrainCamera } from "./camera-depth.js";
import { elevationAt, foundationPad } from "./elevation.js";
import { freshLandSeed, landRandom } from "./land-layout.js";
import { createTerrain, updateTerrain } from "./terrain.js";
import { RESOURCE_GROUPS } from "./resource-groups.js";
import { createFire, animateFire } from "./fire.js";
import { saveKey } from "./modes.js";
import { collectAnimals, animateAnimals } from "../library/animal-motion.js";
import { COMMUNITY } from "../library/community-defs.js";
import { resourceIcon, illustrateResources } from "./resource-icons.js";
import { createManagement } from "./management.js";
import { illustrate } from "./ui-art.js";
import { sunlightAt } from "./sunlight.js";
import { createUtilitiesPreview } from "./utilities-preview.js";
import { syncInfrastructure, LIQUIDS, hasPowerService, canSwitchBuilding, switchBuilding } from "./infrastructure.js";
import { createAccessRoad } from "./access-road.js";
import { captureMotion, interpolateMotion } from "./presentation.js";
import { installCameraNavigation } from "./camera-navigation.js";
import { createJimny } from "../library/vehicles.js";
import {
  ARRIVAL_DURATION,
  vehiclePose,
  arrivalPose,
  arrivalLaneAt,
} from "./arrival.js";
import { createRiver } from "./river.js";
import { riverBankAt, riverAccess } from "./river-layout.js";
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
  buildingFront,
  crossingAt,
  bridgeDeckHeight,
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
  blueprintPurchase,
  requiredLoads,
  createWeekend,
  createSandbox,
  chooseCamp,
  campLocation,
  campPlacementError,
  plan,
  planRoadLine,
  moveProject,
  prioritize,
  supplyRun,
  resolveRain,
  finished,
  tick,
  save,
  restore,
  placementError,
} from "./simulation.js";
const $ = (id) => document.getElementById(id),
  SAVE = saveKey(new URLSearchParams(location.search).get("mode"));
const wildlifePreview = new URLSearchParams(location.search).has("wildlife-preview");
const needsPreview = new URLSearchParams(location.search).has("needs-preview");
const utilitiesPreview = needsPreview || new URLSearchParams(location.search).has(
  "utilities-preview",
);
const restPreview = new URLSearchParams(location.search).has("rest-preview");
const arrivalPreview =
  wildlifePreview ||
  utilitiesPreview ||
  restPreview ||
  new URLSearchParams(location.search).has("arrival-preview");
let s = utilitiesPreview
  ? createUtilitiesPreview(
      new URLSearchParams(location.search).has("interactions"),
      Number(new URLSearchParams(location.search).get("land-seed")) >>> 0,
    )
  : new URLSearchParams(location.search).get("mode") === "sandbox"
    ? createSandbox(freshLandSeed())
    : createWeekend(arrivalPreview ? 0 : freshLandSeed());
if(!arrivalPreview || new URLSearchParams(location.search).has('arrival-preview')) beginArrival(s);
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
if (needsPreview) {
  s.time=200;s.rain=false;s.rainSeen=true;s.rainResolved=true;
  s.people.forEach((r,i)=>{
    r.x=32+i;r.z=37;r.energy=80+i*3;
    r.needs={hunger:85,bladder:85,bowels:85,hygiene:85,social:85,fun:85};
    r.needs[['hunger','bladder','hygiene','social','fun'][i]]=8;
  });
  const home=Object.values(s.infrastructure.nodes).find(n=>n.kind==='home');
  if(home) home.water[0]=5;
}
if (restPreview) for (const resident of s.people) resident.energy = 10;
try {
  if (!arrivalPreview) s = restore(localStorage.getItem(SAVE)) || s;
} catch {}
if (s.stage === "evening") {
  s.stage = "playing";
  s.meal = false;
  for (const r of s.people)
    if (r.action === "meal") {
      r.action = "idle";
      r.walk = [];
      r.target = null;
    }
}
let speed = 1,
  paused = lightingPreview,
  placing = null,
  moving = null,
  selected = null,
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
controls.minZoom = 0.18;
controls.maxZoom = 6;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minPolarAngle = 0.25;
const navigation = installCameraNavigation(camera, controls, {
  home: () => focus(campLocation(s)),
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
  sun.position.set(light.x, light.y, light.z).add(sun.target.position);
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
const ground = createTerrain(s.landSeed, s.elevationSeed, s.terrainPads);
scene.add(ground);
scene.add(compactModel(createAccessRoad()));
const river = createRiver(s.landSeed);
scene.add(compactModel(river.root), river.current);

const grid = new THREE.GridHelper(
  MAP_HALF * 2,
  MAP_CELLS,
  "#b6bd8c",
  "#b6bd8c",
);
grid.position.set(1, 0.015, 1);
const gridPoints = grid.geometry.attributes.position;
const gridVertices = [];
for (let i = 0; i < gridPoints.count; i += 2) {
  const ax = gridPoints.getX(i),
    az = gridPoints.getZ(i),
    bx = gridPoints.getX(i + 1),
    bz = gridPoints.getZ(i + 1);
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
  for (let j = 0; j < steps; j++)
    for (const t of [j / steps, (j + 1) / steps]) {
      const x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      gridVertices.push(
        x,
        elevationAt(x + 1, z + 1, s.elevationSeed, s.terrainPads),
        z,
      );
    }
}
const gridGeometry = new THREE.BufferGeometry();
gridGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(gridVertices, 3),
);
gridGeometry.setAttribute(
  "color",
  new THREE.Float32BufferAttribute(
    gridVertices.map(() => 0.7),
    3,
  ),
);
grid.geometry.dispose();
grid.geometry = gridGeometry;
grid.visible = false;
scene.add(grid);
function world(x, z) {
  return new THREE.Vector3(
    (x - 32) * 2,
    elevationAt((x - 32) * 2, (z - 32) * 2, s.elevationSeed, s.terrainPads),
    (z - 32) * 2,
  );
}
function prop(id, x, z, rotation = 0) {
  const g = compactModel(createAsset(id, Math.round(x * 971 + z * 7919 + s.landSeed)));
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
const sceneryRandom = landRandom(s.landSeed);
const biomeTrees=s.worldSettings?BIOMES[settingsFor(s.landSeed).biome].trees:native;
for (let i = 0; i < Math.round(52*richnessFactor(settingsFor(s.landSeed).resources)); i++) {
  const a = i * 2.3999 + (s.landSeed ? sceneryRandom() * 0.5 : 0),
    r = s.landSeed ? 30 + sceneryRandom() * 25 : 29 + (i % 5) * 5,
    x = 32 + (Math.cos(a) * r) / 2,
    z = 32 + (Math.sin(a) * r) / 2;
  if (
    !riverBankAt(x, z, 2, s.landSeed) &&
    !arrivalLaneAt((x - 32) * 2, (z - 32) * 2)
  )
    scenery.add(
      prop(
        biomeTrees[
          s.landSeed
            ? Math.floor(sceneryRandom() * biomeTrees.length)
            : i % biomeTrees.length
        ] || "tree",
        x,
        z,
        i,
      ),
    );
}
for (let i=0;i<3;i++) {
  const x=s.landSeed?24+sceneryRandom()*5:[25,25,27][i];
  const z=s.landSeed?27+sceneryRandom()*8:[29,33,28][i];
  if(!riverBankAt(x,z,2,s.landSeed) && !accessRoadAt(x,z,2))
    scenery.add(prop(native[Math.floor(sceneryRandom()*native.length)]||'tree',x,z));
}
// Seeded outer regions leave generous open space around the starting clearing.
const regionRandom = landRandom((s.landSeed || 1) ^ 0x51f92);
const regionSets = {
  river: ["jucara", "embauba", "landscape-0", "landscape-7"],
  forest: ["jequitiba", "pau_brasil", "jucara", "landscape-1"],
  meadow: ["pequi", "barbatimao", "bunchgrass", "landscape-2"],
  rocky: ["landscape-4", "landscape-5", "landscape-6", "campo"],
};
for (let i = 0; i < 190; i++) {
  const wx = (regionRandom() - 0.5) * 240,
    wz = (regionRandom() - 0.5) * 240;
  if (Math.hypot(wx, wz) < 57 || arrivalLaneAt(wx, wz)) continue;
  const x = 32 + wx / 2,
    z = 32 + wz / 2;
  if (riverBankAt(x, z, 1, s.landSeed) || accessRoadAt(x, z, 2)) continue;
  const region = riverBankAt(x, z, 13, s.landSeed)
    ? "river"
    : wx < -15
      ? "forest"
      : wx > 60
        ? "rocky"
        : "meadow";
  const set = s.worldSettings && region!=="rocky" ? biomeTrees : regionSets[region],
    id = set[Math.floor(regionRandom() * set.length)];
  const variant = Math.floor(regionRandom() * 3);
  const varied =
    variant && ASSETS.some((a) => a.id === `${id}-variant-${variant}`)
      ? `${id}-variant-${variant}`
      : id;
  scenery.add(prop(varied, x, z, regionRandom() * Math.PI * 2));
}
const entrance = prop("produce-crates", s.stock.x, s.stock.z);
scenery.add(prop("garden-bench", s.stock.x - 2, s.stock.z + 1));
let sceneryMesh = compactModel(scenery);
scene.add(sceneryMesh);
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
const campGroup = new THREE.Group();
scene.add(campGroup);
let campDrawn = null;
function drawCamp() {
  if (campDrawn === s.camp) return;
  campDrawn = s.camp;
  campGroup.clear();
  if (!s.camp) return;
  const c = campLocation(s);
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
      [CELL_MIN + 1.5, CELL_MIN + 1.5],
      [CELL_MAX - 2.5, CELL_MIN + 1.5],
      [CELL_MAX - 2.5, CELL_MAX - 2.5],
      [CELL_MIN + 1.5, CELL_MAX - 2.5],
    ].map(([x, z]) => world(x, z).setY(0.025)),
  ),
  new THREE.LineBasicMaterial({ color: "#e0dfad" }),
);
scene.add(border);
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
  const night = 1 - sunlightAt(s.time).daylight;
  for (const [id, entry] of buildings) {
    if (entry.houseLighting)
      updateHouseLighting(
        entry.houseLighting,
        night * (sys.nodes[id]?.enabled ? sys.nodes[id]?.power || 0 : 0),
      );
  }
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
      world(p.x + (footprint(p)[0] - 1) / 2, p.z + (footprint(p)[1] - 1) / 2),
    );
    light.distance = n.kind === "home" ? 5 : 10;
    if (n.kind === "home") {
      const entry = buildings.get(p.id);
      const spill =
        entry?.houseLighting?.spill.clone() || new THREE.Vector3(0.8, 1.4, 2.1);
      spill.applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        ((p.rotation || 0) * Math.PI) / 2,
      );
      light.position.add(spill);
    } else light.position.y += n.kind === "streetlight" ? 2.7 : 1.6;
    light.intensity =
      night * (n.enabled ? n.power || 0 : 0) * (n.kind === "home" ? 3.5 : 12);
  }
}
const buildings = new Map();
const assets = new Set(ASSETS.map((a) => a.id));
let terrainPadCount = s.terrainPads?.length || 0, terrainLayer = s.terrainPads;
function syncTerrain() {
  if (terrainLayer === s.terrainPads && terrainPadCount === (s.terrainPads?.length || 0)) return;
  terrainLayer = s.terrainPads;
  terrainPadCount = s.terrainPads.length;
  updateTerrain(ground, s.elevationSeed, s.terrainPads);
  for (const p of s.projects.filter((p) => p.key === "road")) {
    const entry = buildings.get(p.id);
    if (entry) {
      scene.remove(entry.root);
      disposeModel(entry.root);
      buildings.delete(p.id);
    }
  }
  const points = grid.geometry.attributes.position;
  for (let i = 0; i < points.count; i++)
    points.setY(
      i,
      elevationAt(
        points.getX(i) + 1,
        points.getZ(i) + 1,
        s.elevationSeed,
        s.terrainPads,
      ),
    );
  points.needsUpdate = true;
  grid.geometry.computeBoundingSphere();
  for (const child of scenery.children)
    child.position.y = elevationAt(
      child.position.x,
      child.position.z,
      s.elevationSeed,
      s.terrainPads,
    );
  scene.remove(sceneryMesh);
  sceneryMesh.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  sceneryMesh = compactModel(scenery);
  scene.add(sceneryMesh);
  if (s.camp) {
    const c = campLocation(s);
    campGroup.position.copy(world(c.x, c.z));
  }
}
function syncBuildings() {
  syncTerrain();
  autoConnectUtilities(s, PROJECTS);
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
    if (
      !entry ||
      entry.asset !== id ||
      (p.key === "road" &&
        entry.groundKey !== `${p.x},${p.z},${p.rotation || 0}`)
    ) {
      if (entry) {
        scene.remove(entry.root);
        disposeModel(entry.root);
      }
      const root = prop(
        id,
        p.x + (footprint(p)[0] - 1) / 2,
        p.z + (footprint(p)[1] - 1) / 2,
      );
      if (p.key === "road") {
        root.traverse((o) => {
          if (!o.geometry) return;
          const previous = o.geometry;
          o.geometry = drapeRoadGeometry(previous, root.position,
            ((p.rotation || 0) * Math.PI) / 2, s.elevationSeed, s.terrainPads);
          previous.dispose();
        });
      }
      root.userData.projectId = p.id;
      entry = {
        root,
        asset: id,
        animals: collectAnimals(root),
        groundKey: `${p.x},${p.z},${p.rotation || 0}`,
      };
      if (def.kind === "home" && fraction >= 1)
        entry.houseLighting = prepareHouseLighting(root);
      buildings.set(p.id, entry);
    }
    entry.root.position.copy(
      world(p.x + (footprint(p)[0] - 1) / 2, p.z + (footprint(p)[1] - 1) / 2),
    );
    entry.root.rotation.y = ((p.rotation || 0) * Math.PI) / 2;
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
  const target = c ? world(c.x, c.z) : world(s.stock.x, s.stock.z + 2);
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(32, 35, 32));
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.update();
}
focus(s.arrivalAnimating ? s.stock : campLocation(s));

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
let activeSaveSlot;
try { activeSaveSlot=saveSlots(localStorage).active(s.mode||"story"); } catch {}
function persist() {
  if (arrivalPreview) return;
  try {
    saveSlots(localStorage).autosave(s.mode || "story", save(s), activeSaveSlot);
  } catch {
    message(
      "Progress cannot be saved in this browser. Keep this tab open to continue.",
    );
  }
}
let lastRoad = null,
  shiftPlacement = false;
let placementRotation = 0,
  wireframe = null;
const rotateButton = $("rotate-placement");
function rotatePlacement(direction = 1) {
  if (!placing) return;
  placementRotation = (placementRotation + direction + 4) % 4;
  rotateButton.textContent = `Rotate · R · ${placementRotation * 90}°`;
  updatePlacementPreview();
}
rotateButton.onclick = () => rotatePlacement();
function cancel() {
  placing = null;
  moving = null;
  lastRoad = null;
  roadPreview.visible = false;
  if (wireframe) wireframe.visible = false;
  rotateButton.hidden = true;
  ghost.visible = false;
  $("cancel").hidden = true;
  grid.visible = false;
  renderUI();
}
function startPlacement(key, id = null) {
  if (openPanel === "terrain-panel") setPanel(null);
  lastRoad = null;
  roadPreview.visible = false;
  placing = key;
  moving = id;
  placementRotation = s.projects.find((p) => p.id === id)?.rotation || 0;
  if (wireframe) {
    scene.remove(wireframe);
    wireframe.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
  wireframe = new THREE.Group();
  const model = compactModel(createAsset(PROJECTS[key].asset));
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const edges = new THREE.EdgesGeometry(o.geometry, 18);
    edges.applyMatrix4(o.matrixWorld);
    wireframe.add(
      new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: "#d9eda5",
          transparent: true,
          opacity: 0.85,
          depthTest: false,
        }),
      ),
    );
  });
  disposeModel(model);
  scene.add(wireframe);
  wireframe.visible = false;
  rotateButton.hidden = key === "road";
  rotateButton.textContent = `Rotate · R · ${placementRotation * 90}°`;
  ghost.visible = false;
  $("cancel").hidden = false;
  grid.visible = true;
  message(
    key === "bridge"
      ? "Span the river with both ends on dry land. R rotates. Esc cancels."
      : key === "road"
        ? "Mark a road route. Residents bring materials and build each section. Shift-click extends; Esc finishes planning."
        : "Choose a building site. R rotates. Shift-click repeats. Ground levels automatically. Esc cancels.",
  );
  renderUI();
}

const buildMaterialTooltip = materialTooltip();
for (const [key, d] of Object.entries(PROJECTS)) {
  const b = document.createElement("button");
  b.id = `build-${key}`;
  const count = Object.values(d.materials).reduce((a, b) => a + b, 0);
  b.innerHTML = `<span class="material-warning" aria-hidden="true">!</span><img class="build-art" alt=""/><strong>${d.name}</strong><span class="build-cost">${s.mode === "sandbox" ? "Free" : `${count} materials`} <i>· ${d.size.join("×")}</i></span>`;
  b.setAttribute("aria-label", `${d.name}. ${recipeText(key)}`);
  b.title = d.description;
  buildMaterialTooltip.attach(b);
  b.dataset.category = d.category;
  b.onclick = () => { setPanel(null); startPlacement(key); };
  $("build-list").append(b);
}
const ray = new THREE.Raycaster(),
  mouse = new THREE.Vector2();
let down = null,
  cell = null;
const roadPreview = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: "#e8d796", depthTest: false }),
);
roadPreview.visible = false;
scene.add(roadPreview);
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
  if (openPanel === "terrain-panel") {
    const point = hit(e);
    terrainBrush.visible = !!point;
    if (point) {
      const radius = Number($("terrain-radius").value);
      const points = Array.from({length:65},(_,i)=>{
        const x = point.x + Math.cos(i/64*Math.PI*2)*radius;
        const z = point.z + Math.sin(i/64*Math.PI*2)*radius;
        return new THREE.Vector3(x,elevationAt(x,z,s.elevationSeed,s.terrainPads)+.08,z);
      });
      terrainBrush.geometry.dispose();
      terrainBrush.geometry = new THREE.BufferGeometry().setFromPoints(points);
    }
    return;
  }
  const pitching =
    s.stage === "arrival" && s.arrivalElapsed >= ARRIVAL_DURATION;
  if (!placing && !pitching) return;
  const p = hit(e);
  if (!p) {
    ghost.visible = false;
    if (wireframe) wireframe.visible = false;
    roadPreview.visible = false;
    return;
  }
  shiftPlacement = e.shiftKey;
  cell = { x: Math.round(p.x / 2 + 32), z: Math.round(p.z / 2 + 32) };
  updatePlacementPreview();
});
function updatePlacementPreview() {
  if (!cell) return;
  const pitching =
    !placing && s.stage === "arrival" && s.arrivalElapsed >= ARRIVAL_DURATION;
  if (!placing && !pitching) return;
  const size = pitching
    ? [5, 4]
    : footprint({ key: placing, rotation: placementRotation });
  ghost.scale.set(size[0] / 2, size[1] / 2, 1);
  ghost.position.copy(
    world(
      cell.x + (pitching ? 1 : (size[0] - 1) / 2),
      cell.z + (pitching ? -1.5 : (size[1] - 1) / 2),
    ),
  );
  if (pitching) {
    const pad = foundationPad(cell.x-1,cell.z-3,5,4,s.elevationSeed,s.terrainPads);
    if (pad) ghost.position.y = pad.height;
  }
  ghost.position.y += 0.04;
  ghost.visible = true;
  const error = pitching
    ? campPlacementError(s, cell.x, cell.z)
    : placementError(s, placing, cell.x, cell.z, moving, placementRotation);
  roadPreview.visible = false;
  let hint = error;
  if (placing) {
    const missing = moving ? [] : missingMaterials(s, placing);
    const purchase = blueprintPurchase(s, placing);
    hint ||= missing.length ? purchase.error || `Place to buy missing materials for R$${purchase.cost.toFixed(2)} · ${s.trip ? "Pickup queued after current trip" : "Resident pickup arranged automatically"}` : "";
    if (placing === "road" && shiftPlacement && lastRoad) {
      const line = roadLine(lastRoad, cell);
      if (!line) hint = "Extend roads in a straight row or column.";
      else {
        roadPreview.geometry.dispose();
        roadPreview.geometry = new THREE.BufferGeometry().setFromPoints(
          line.map((c) => world(c.x, c.z).add(new THREE.Vector3(0, 0.08, 0))),
        );
        roadPreview.visible = true;
        const count = line.filter((c) => !s.projects.some((p) => p.key === "road" && p.x === c.x && p.z === c.z)).length;
        const total = blueprintPurchase(s, "road", count);
        hint = error || total.error || `${count} road sections${total.cost ? ` · Auto-buy R$${total.cost.toFixed(2)} total` : " · Materials available"} · Shift-click to plan`;
      }
    }
    message(
      hint ||
        `${PROJECTS[placing].name} · ${size.join("×")} · ${placementRotation * 90}° · ${placing === "road" ? "Shift-click extends roads" : "R rotates · Shift-click repeats"}`,
    );
  } else if (hint) message(hint);
  ghost.material.color.set(error ? "#c26847" : "#d9eda5");
  if (!pitching && wireframe) {
    ghost.visible = false;
    wireframe.visible = true;
    wireframe.position.copy(ghost.position);
    const pad = foundationPad(
      cell.x,
      cell.z,
      size[0],
      size[1],
      s.elevationSeed,
      s.terrainPads,
    );
    if (pad && !["road", "bridge"].includes(placing))
      wireframe.position.y = pad.height + 0.025;
    wireframe.rotation.y = (placementRotation * Math.PI) / 2;
    wireframe.traverse((o) =>
      o.material?.color.set(error ? "#e88767" : "#d9eda5"),
    );
  }
}
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
  if (openPanel === "terrain-panel") {
    const old = s.terrainPads.find(p=>p.terraform);
    const tool = $("terrain-tool").value;
    if (tool === "flatten" && flattenLevel === null) flattenLevel = p.y;
    if (terraform(s,p.x,p.z,tool,Number($("terrain-radius").value),flattenLevel)) {
      terrainHistory.push(old);
      if (terrainHistory.length>20) terrainHistory.shift();
      $("terrain-undo").disabled = false;
      syncTerrain(); syncBuildings(); persist();
      message("Terrain updated · no materials, money or resident work used.");
    } else message("No change here. Try open ground away from protected areas.");
    $("terrain-level").textContent = flattenLevel === null ? "Flatten uses the height of your first click." : `Flatten height: ${flattenLevel.toFixed(1)} m`;
    return;
  }
  if (s.stage === "arrival" && s.arrivalElapsed >= ARRIVAL_DURATION) {
    const error = campPlacementError(s, x, z);
    if (error) {
      message(error);
      return;
    }
    chooseCamp(s, { x, z });
    ghost.visible = false;
    focus(campLocation(s));
    persist();
    renderUI();
    return;
  }
  if (placing) {
    const error = moving
      ? moveProject(s, moving, x, z, placementRotation)
      : placing === "road" && e.shiftKey && lastRoad
        ? planRoadLine(s, lastRoad, { x, z })
        : plan(s, placing, x, z, placementRotation);
    if (error) {
      message(error);
      return;
    }
    if (placing === "road" && !moving) lastRoad = { x, z };
    const repeat =
      e.shiftKey && (s.mode === "sandbox" || PROJECTS[placing].repeatable);
    if (moving || (placing !== "road" && !repeat)) cancel();
    roadPreview.visible = false;
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
$("copy-building").onclick = () => {
  const p = s.projects.find((p) => p.id === selected);
  if (p) {
    const rotation = p.rotation || 0;
    selected = null;
    setPanel(null);
    startPlacement(p.key);
    placementRotation = rotation;
    rotateButton.textContent = `Rotate · R · ${rotation * 90}°`;
  }
};
$("focus-selection").onclick = () => {
  const p = s.projects.find((p) => p.id === selected);
  if (p)
    focus({
      x: p.x + (footprint(p)[0] - 1) / 2,
      z: p.z + (footprint(p)[1] - 1) / 2,
    });
};
$("close-selection").onclick = () => {
  selected = null;
  renderUI();
};
$("cancel").onclick = cancel;
addEventListener("keyup", (e) => {
  if (e.key === "Shift") {
    shiftPlacement = false;
    roadPreview.visible = false;
  }
});
addEventListener("keydown", (e) => {
  const editing =
    e.target.closest?.('input,textarea,select,[contenteditable="true"]') ||
    $("management").open || $("people").open;
  if (e.key === "Shift" && !editing) {
    shiftPlacement = true;
    updatePlacementPreview();
  }
  if (!editing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.code === "KeyB" && s.stage === "playing") {
      e.preventDefault();
      setPanel(openPanel === "build" ? null : "build");
    }
    if (e.code === "KeyG") {
      e.preventDefault();
      $("grid").click();
    }
    if (e.code === "KeyF") {
      e.preventDefault();
      if (selected) $("focus-selection").click();
      else focus(campLocation(s));
    }
    if (e.code === "Space" && !e.target.closest?.("button,summary,a")) {
      e.preventDefault();
      $("pause").click();
    }
  }
  if (
    e.code === "KeyR" &&
    placing &&
    !e.repeat &&
    !e.target.closest?.("input,textarea,select,dialog")
  ) {
    e.preventDefault();
    rotatePlacement(e.shiftKey ? -1 : 1);
  }
  if (e.key === "Escape" && !$("management").open && !$("people").open) {
    if (placing) cancel();
    else if (selected) {
      selected = null;
      uiSignature = "";
      renderUI();
    } else if (openPanel) setPanel(null);
  }
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
$("home").onclick = () => focus(campLocation(s));
$("river-view").onclick = () => focus(riverAccess(s.landSeed));
$("rotate-left").onclick = () => navigation.rotate(-Math.PI / 2);
$("rotate-right").onclick = () => navigation.rotate(Math.PI / 2);
$("zoom-in").onclick = () => navigation.zoom(1.2);
$("zoom-out").onclick = () => navigation.zoom(1 / 1.2);
$("grid").onclick = () => {
  grid.visible = !grid.visible;
  $("grid").setAttribute("aria-pressed", String(grid.visible));
};
function askReset() {
  $("reset-dialog").showModal();
}
let savesWasPaused=false;
installSaveDialog($("saved-villages"), {onSaved:slot=>{activeSaveSlot=slot.id;},current:()=>({mode:s.mode||'story',data:save(s)}),beforeOpen:()=>{savesWasPaused=paused;paused=true;},afterClose:()=>{paused=savesWasPaused;updatePauseButton();}});
$("main-menu").onclick = () => {
  persist();
  location.href = "./menu.html";
};
$("auto-buy").onclick=()=>{s.autoBuy=s.autoBuy===false;uiSignature='';persist();renderUI();};
$("sandbox-instant").onclick = () => {
  s.instantBuild = s.instantBuild === false;
  uiSignature = "";
  renderUI();
  persist();
};
$("restart").onclick = askReset;
$("keep").onclick = () => $("reset-dialog").close();
$("confirm-reset").onclick = () => {
  // pagehide also saves: replace live state before navigating so it cannot resurrect the old camp.
  s = s.mode === "sandbox" ? createSandbox() : createWeekend();
  persist();
  location.reload();
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
const resourceTrends = createResourceTrends();
let uiSignature = "", expandedResident = null, residentTab = "Overview";
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
  const generation = nodes.reduce((a, n) => a + (n.generation || 0), s.infrastructure?.grid?.importing || 0),
    demand = nodes.reduce((a, n) => a + (n.demand || 0), 0),
    stored = nodes.reduce((a, n) => a + n.charge, 0),
    capacity = nodes.reduce((a, n) => a + n.battery, 0);
  const liquids = LIQUIDS.map(
    (key, i) =>
      `${Math.floor(nodes.reduce((a, n) => a + n.water[i], 0))} ${key}`,
  ).join(" · ");
  $("utility-summary").textContent =
    `Power: ${generation.toFixed(1)} kW available / ${demand.toFixed(1)} kW requested. Battery ${stored.toFixed(1)}/${capacity} kWh. Water: ${liquids}.${sys.thirst ? " Drinking water is empty! Fetch, filter and deliver water to camp." : ""}${sys.hungry ? " Food is empty. Buy ingredients or grow and cook food." : ""}${sys.sanitationBlocked ? " Sewage storage is full. Build more treatment capacity." : ""}`;
  $("utility-links").replaceChildren();
  for (const l of sys.links.filter(
    (l) => (management?.view === "power") === (l.kind === "power"),
  )) {
    const b = document.createElement("button");
    b.textContent = `${{ power: "Power", fresh: "Drinking water", irrigation: "Irrigation", greywater: "Greywater", sewage: "Sewage" }[l.kind]} · ${labels.find(([id]) => id === l.from)?.[1]} → ${labels.find(([id]) => id === l.to)?.[1]}: ${l.work < l.required ? Math.floor((l.work / l.required) * 100) + "% installed" : l.enabled ? "on" : "off"}`;
    b.setAttribute("aria-pressed", String(l.enabled));
    b.title = l.enabled
      ? "Switch this connection off"
      : "Switch this connection on";
    b.onclick = () => {
      l.enabled = !l.enabled;
      persist();
      renderUI();
    };
    $("utility-links").append(b);
    if (l.automatic) continue;
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
      "Compatible buildings connect automatically when construction finishes.";
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
  $("toggle-building").hidden = !canSwitchBuilding(sys,node);
  $("toggle-building").disabled = !canSwitchBuilding(sys,node);
  $("toggle-building").textContent = node?.enabled ? "Switch off" : "Switch on";
  const op = p && (s.operations || []).find((o) => o.site === p.id && !o.done);
  $("building-service").textContent = node
    ? `${hasPowerService(sys,node) ? `Power ${(node.power * 100).toFixed(0)}%` : ""}${node.battery ? ` · Battery ${node.charge.toFixed(1)}/${node.battery} kWh` : ""}${hasPowerService(sys,node) ? ". " : ""}${LIQUIDS.map(
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
  const recipe=PROCESSES[$("production").value];
  if(p && recipe?.deposit) $("building-service").textContent+=` · Deposit: ${Math.max(0,depositCapacity(s.landSeed,p,recipe)-(p.extracted||0))} remaining`;
  $("building-service").hidden = !$("building-service").textContent.trim();
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
  if (!switchBuilding(s.infrastructure,selected)) return;
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
const categories = BUILD_CATEGORIES;
refillSelect(
  "build-category",
  categories.map((c) => [c, c]),
);
if (s.mode === "sandbox") $("build-category").value = "Homes & shelter";
for (const category of categories) {
  const button=document.createElement("button");
  button.textContent=category;
  button.onclick=()=>{ $("build-category").value=category; $("build-search").value=""; filterBuildings(); };
  button.dataset.category=category;
  $("build-categories").append(button);
}
function filterBuildings() {
  const query=$("build-search").value.trim().toLowerCase();
  const category=$("build-category").value;
  let count=0;
  for (const [key,d] of Object.entries(PROJECTS)) {
    const button=$(`build-${key}`);
    // Search the entire catalogue, even when a category was selected earlier.
    button.hidden=query ? !`${d.name} ${d.description} ${buildingCategory(d)}`.toLowerCase().includes(query)
      : !inBuildCategory(key,d,category);
    if(!button.hidden){count++;illustrate(button.querySelector("img"),d.asset);}
  }
  for(const button of $("build-categories").children) {
    button.setAttribute("aria-pressed",String(!query && button.dataset.category===category));
  }
  $("build-count").textContent=`${query ? "Search results" : category} · ${count} building${count===1?"":"s"}`;
  $("build-empty").hidden=count>0;
  $("build-list").scrollTop=0;
}
$("build-category").onchange = filterBuildings;
$("build-search").oninput = filterBuildings;
let openPanel = null, flattenLevel = null, residentsWasPaused = false;
const terrainHistory = [];
const terrainBrush = new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffe1a0,depthTest:false}));
terrainBrush.visible = false; terrainBrush.renderOrder = 10; scene.add(terrainBrush);
$("terrain-tool").onchange = $("terrain-pick").onclick = () => {
  flattenLevel = null;
  $("terrain-level").textContent = "Flatten uses the height of your first click.";
};
$("terrain-undo").onclick = () => {
  if (!terrainHistory.length) return;
  const layer = terrainHistory.pop();
  s.terrainPads = s.terrainPads.filter(p=>!p.terraform);
  if(layer) s.terrainPads.push(layer);
  syncTerrain(); syncBuildings(); persist();
  $("terrain-undo").disabled = !terrainHistory.length;
  message("Terrain edit undone.");
};
function setPanel(panel) {
  if (placing) cancel();
  if(panel==='people') {
    expandedResident??=s.people[0].id;
    residentsWasPaused=paused;paused=true;updatePauseButton();
    if(!$("people").open) $("people").showModal();
  } else if($("people").open) $("people").close();
  openPanel = panel;
  terrainBrush.visible = false;
  $("terrain-panel").hidden = panel !== "terrain-panel";
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
$("people").addEventListener('close',()=>{
  paused=residentsWasPaused;updatePauseButton();
  if(openPanel==='people')openPanel=null;
  uiSignature='';renderUI();
});
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
    Math.floor(s.money * 100),
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
    s.log,
    s.people.map((r) => [r.action, r.tentPhase, r.needTask?.label, r.needBlocked, Math.floor(r.work/10), JSON.stringify(r.friendships), r.needTask?.elapsed>0, ...needMeters(r).map(([,value])=>Math.round(value))]),
    s.projects.map((p) => [
      p.id, p.delivered, p.staged,
      Math.floor((p.work / PROJECTS[p.key].work) * 100),
    ]),
  ]);
  if (signature === uiSignature) return;
  uiSignature = signature;
  const active = s.stage !== "arrival" && !s.arrivalAnimating;
  if(s.arrivalAnimating) message("Our friends are arriving…");
  else if(s.stage === "arrival") message("Click clear ground to pitch your tents.");
  $("auto-buy").hidden=s.mode==='sandbox';
  $("auto-buy").textContent=`Auto-buy: ${s.autoBuy===false?'off':'on'}`;
  $("auto-buy").setAttribute('aria-pressed',String(s.autoBuy!==false));
  $("auto-buy").classList.toggle('active',s.autoBuy!==false);
  $("sandbox-instant").hidden = s.mode !== "sandbox";
  $("sandbox-instant").textContent =
    `Instant buildings: ${s.instantBuild === false ? "off" : "on"}`;
  $("sandbox-instant").title = "Roads always require resident construction.";
  $("sandbox-instant").setAttribute(
    "aria-pressed",
    String(s.instantBuild !== false),
  );
  $("village-actions").hidden = !active;
  document.querySelectorAll("[data-panel-toggle]").forEach((button) => {
    const opened = openPanel === button.dataset.panelToggle && !selected;
    button.setAttribute("aria-expanded", String(opened));
    button.classList.toggle("active", opened);
  });
  $("projects-panel").hidden =
    !active || openPanel !== "projects-panel" || !!selected;

  $("build").hidden =
    !active || s.stage === "evening" || openPanel !== "build" || !!selected;
  const trends=resourceTrends(s.time,resourceSnapshot(s));
  const counters = [
    ["money", `R$${s.money.toFixed(2)}`, "Savings", "resources"],
    ["meals", s.materials.meals || 0, "Meals", "resources"],
    [
      "power",
      `${Object.values(s.infrastructure?.nodes || {})
        .reduce((a, n) => a + (n.generation || 0), s.infrastructure?.grid?.importing || 0)
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
          `<button class="resource" data-panel="${panel}" title="Open ${panel} management">${resourceIcon(icon)}<b></b><small>${label}</small><em class="resource-trend"></em></button>`,
      )
      .join("");
  illustrateResources($("supplies"));
  counters.forEach((counter, i) => {
    $("supplies").children[i].querySelector("b").textContent =
      s.mode === "sandbox" && i < 3 ? "∞" : counter[1];
    const button=$("supplies").children[i],rate=trends?.[counter[0]]??null;
    const trend=button.querySelector('.resource-trend');
    const unlimited=s.mode==='sandbox'&&i<3;
    trend.textContent=unlimited?'Unlimited':formatTrend(rate,i===0);
    trend.dataset.direction=rate>.05?'up':rate<-.05?'down':'flat';
    button.title=`Open ${counter[3]} management. ${unlimited?'Unlimited in sandbox.':rate===null?'Gathering trend data (first five in-game minutes).':`${i===3?'Stored energy':counter[2]}: ${formatTrend(rate,i===0)} net change over the last in-game hour, or time observed since loading. Includes spending, consumption and deliveries.`}`;
    button.disabled = !active;
  });
  const minutes = 9 * 60 + Math.floor(s.time * 0.45);
  $("clock").textContent =
    s.stage === "evening"
      ? "Saturday · Evening"
      : `Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
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
      workStatus.textContent = constructionStatus(s, p, d, requiredLoads(p.key));
      div.append(workStatus);
    }
    $(done ? "completed-tasks" : "tasks").append(div);
  }
  $("roster").replaceChildren();
  $("resident-detail").replaceChildren();
  for (const r of s.people) {
    const div = document.createElement("div");
    div.className = "person";
    const portrait = document.createElement("img");
    portrait.className = "portrait";
    illustrate(portrait, r.id);
    div.dataset.resident = r.id;
    const name = document.createElement("strong");
    name.textContent = r.name;
    name.title = profileFor(r).role;
    const energy = document.createElement("span");
    const meters=needMeters(r), lowest=[...meters].sort((a,b)=>a[1]-b[1])[0];
    energy.textContent = `${lowest[0]} ${Math.round(lowest[1])}%`;
    const status = document.createElement("span");
    status.textContent = r.needTask
      ? (r.needTask.elapsed>0 ? r.needTask.label : {hunger:"Getting something to eat",bladder:"Heading for a toilet break",bowels:"Heading for a toilet break",hygiene:r.needTask.river?"Walking to the river to wash":"Heading to wash up",social:"Meeting a friend",fun:"Taking a recreation break"}[r.needTask.kind])
      : r.tentPhase === "exit"
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
    if(r.job && r.cargo && r.haulLoads) status.textContent = `Carrying ${r.haulLoads} load${r.haulLoads===1?'':'s'} to ${r.haulStage==='storage'?'nearby storage':PROJECTS[s.projects.find(p=>p.id===r.job)?.key]?.name || 'the building site'}`;
    if(r.needBlocked && !r.needTask) status.textContent += ` · ${r.needBlocked}`;
    status.className = "resident-status";
    const needs=document.createElement('div');
    needs.className='resident-needs';
    for(const [label,value] of meters) {
      const item=document.createElement('label');
      item.className=value<25?'need-low':value<50?'need-warn':'need-good';
      const text=document.createElement('span');text.textContent=`${label} ${Math.round(value)}%`;
      const progress=document.createElement('progress');progress.max=100;progress.value=value;
      progress.setAttribute('aria-label',`${r.name}: ${label}`);
      item.append(text,progress);needs.append(item);
    }
    const profile=profileFor(r), chosen=expandedResident===r.id;
    const pick=document.createElement('button');pick.className='resident-picker';
    pick.setAttribute('aria-pressed',String(chosen));pick.setAttribute('aria-label',`View ${r.name}`);
    pick.append(portrait,name,status,energy);
    pick.onclick=()=>{expandedResident=r.id;uiSignature='';renderUI();$("roster").querySelector(`[data-resident="${r.id}"] button`)?.focus();};
    div.append(pick);
    if(chosen){
      const detail=document.createElement('section');detail.className='resident-profile';
      const heading=document.createElement('div');heading.className='resident-heading';
      const face=document.createElement('img');illustrate(face,r.id);face.alt='';
      const identity=document.createElement('div');
      const title=document.createElement('h2');title.textContent=r.name;
      const role=document.createElement('p');role.textContent=profile.role;
      const traits=document.createElement('p');traits.className='resident-traits';traits.textContent=profile.traits.join(' · ');
      identity.append(title,role,traits);heading.append(face,identity);detail.append(heading);
      const tabs=document.createElement('nav');tabs.className='resident-tabs';tabs.setAttribute('aria-label','Profile sections');
      for(const label of ['Overview','Skills','Relationships']){
        const tab=document.createElement('button');tab.textContent=label;tab.setAttribute('aria-pressed',String(residentTab===label));
        tab.onclick=()=>{residentTab=label;uiSignature='';renderUI();};tabs.append(tab);
      }
      detail.append(tabs);
      const paragraph=(text,kind='p')=>{const el=document.createElement(kind);el.textContent=text;detail.append(el);};
      if(residentTab==='Overview'){
        const activity=document.createElement('div');activity.className='resident-activity';activity.textContent=status.textContent;detail.append(activity);
        paragraph('Needs','h3');detail.append(needs);
        paragraph('About '+r.name,'h3');paragraph(profile.bio);
        paragraph(profile.effect);paragraph(`Enjoys ${profile.hobby.toLowerCase()}.`);
      } else if(residentTab==='Skills'){
        paragraph('Specialties · 25% faster','h3');
        const list=document.createElement('div');list.className='resident-specialties';
        for(const key of profile.strengths){if(!PROJECTS[key])continue;const chip=document.createElement('span');chip.textContent=PROJECTS[key].name;list.append(chip);}
        detail.append(list);
        const bonus=Math.min(15,Math.max(0,r.work)/100);
        paragraph('Learning by doing','h3');paragraph(`+${Math.floor(bonus)}% speed on all work`);
        const progress=document.createElement('progress');progress.max=15;progress.value=bonus;progress.setAttribute('aria-label','Experience bonus');detail.append(progress);
        paragraph('Hands-on work gradually improves efficiency, up to a 15% bonus.');
      } else {
        paragraph('Growing together','h3');paragraph('Shared conversations strengthen friendships. Familiar friends are preferred when nearby.');
        for(const friend of s.people.filter(p=>p!==r)){
          const score=r.friendships?.[friend.id]||0,row=document.createElement('div');row.className='relationship-row';
          const img=document.createElement('img');illustrate(img,friend.id);img.alt='';
          const text=document.createElement('div');const n=document.createElement('strong');n.textContent=friend.name;
          const label=document.createElement('p');label.textContent=friendshipLabel(score);
          const bar=document.createElement('progress');bar.max=100;bar.value=score;bar.setAttribute('aria-label',`Friendship with ${friend.name}`);
          text.append(n,label,bar);row.append(img,text);detail.append(row);
        }
      }
      $("resident-detail").append(detail);
    }
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
  $("sell").textContent =
    `Sell ${materialText($("purchase").value, purchase.quantity)} · R$${Math.floor(purchase.price * 0.5)}`;
  $("sell").disabled =
    materialCount(s, $("purchase").value) < purchase.quantity ||
    !purchase.quantity;
  $("trip").textContent = s.trip
    ? `${s.people.find((r) => r.id === s.trip.person).name}: ${{ boarding: "walking to the car", outbound: "driving to town", away: "collecting supplies in town", inbound: "driving home", unloading: "unloading supplies" }[s.trip.phase]}.`
    : `Storage: ${Math.round(storedMaterials(s))}/${storageCapacity(s)} units. Buy essentials or sell locally produced surplus.`;
  $("rain").hidden = !s.rainSeen || s.rainResolved;
  $("boards").disabled = s.wood < 2;
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
    buildMaterialTooltip.update(b,missing);
    const purchase = blueprintPurchase(s, key);
    b.title = `${PROJECTS[key].description} Materials: ${recipeText(key)}. ${missing.length ? purchase.error || `Auto-buy missing materials: R$${purchase.cost.toFixed(2)}. Resident pickup included.` : "All materials available."}`;
    b.querySelector(".build-cost").textContent = s.mode === "sandbox" ? "Free"
      : s.autoBuy===false && missing.length ? 'Missing materials'
      : purchase.cost ? `Auto-buy R$${purchase.cost.toFixed(2)}`
      : `${Object.values(PROJECTS[key].materials).reduce((sum, n) => sum + n, 0)} materials · ${PROJECTS[key].size.join("×")}`;
    b.classList.toggle("active", placing === key);
    b.classList.toggle("needs-materials", missing.length > 0);
  }
  renderUtilityUI();
  management?.render();
  const p = s.projects.find((p) => p.id === selected);
  $("selection").hidden = !p || s.stage === "evening";
  if (p) {
    $("selected-name").textContent = PROJECTS[p.key].name;
    $("copy-building").hidden =
      s.mode !== "sandbox" && !PROJECTS[p.key].repeatable;
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
      `${PROJECTS[p.key].description}${p.work >= PROJECTS[p.key].work ? livestock : ""} ${p.pendingMaterials ? "Purchased materials awaiting pickup." : "Materials reserved."} Recipe: ${recipeText(p.key)}. Delivered ${p.delivered}/${requiredLoads(p.key)} loads. Labor ${Math.round(p.work * 0.45)}/${Math.round(PROJECTS[p.key].work * 0.45)} person-minutes.`;
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
const capybaras = createCapybaraVisitors(scene,s);
const wildlife = createWildlife(scene,s,wildlifePreview ? {random:()=>.75} : {});
if(wildlifePreview) for(let i=0;i<270;i++) wildlife.update(.1);
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
  wildlife.update(!paused && !document.hidden ? dt : 0);
  capybaras.update(!paused && !document.hidden ? dt : 0);
  const visual = interpolateMotion(previousMotion, s, accumulator / 0.1);
  const arrivalTime=Math.max(0,s.arrivalElapsed-(paused?0:0.1)+accumulator);
  drawCamp();
  syncBuildings();
  if (!paused && !document.hidden) animalTime += dt * speed;
  for (const [id, entry] of buildings)
    if (entry.animals.length)
      animateAnimals(entry.animals, animalTime + id * 2.73);
  for (const [id, entry] of buildings)
    if (entry.fire) animateFire(entry.fire, animalTime + id * 2.73);
  entrance.position.copy(world(s.stock.x, s.stock.z));
  for (const [index, vehicle] of vehicles.entries()) {
      const trip = s.trip && {
        ...s.trip,
        left: s.trip.left + (s.time - visual.time),
      };
      const pose = s.arrivalAnimating ? {...vehiclePose(arrivalTime,index),visible:true} : townCarPose(trip, index);
      vehicle.root.visible = pose.visible;
      vehicle.root.position.set(pose.x, 0, pose.z);
      vehicle.root.rotation.y = pose.yaw;
      for (const wheel of vehicle.wheels) {
        wheel.rotation.set(0, 0, Math.PI / 2);
        wheel.rotateY((pose.z + 22) / 0.41);
      }
    }
  for (const [i, r] of s.people.entries()) {
    const g = actors[i];
    if(s.arrivalAnimating){
      const pose=arrivalPose(arrivalTime,i);
      g.visible=pose.visible;g.position.set(pose.x,pose.y,pose.z);g.rotation.y=pose.yaw;
      animateResident(g.rig,pose.walking?'walk':'idle',arrivalTime+i*.7,paused?0:dt*speed);
      continue;
    }
    g.visible =
      (r.action !== "town" ||
        ["boarding", "unloading"].includes(s.trip?.phase)) &&
      r.tentPhase !== "inside" &&
      !(r.needTask?.private && r.needTask.elapsed > 1 && r.needTask.elapsed < r.needTask.duration-1);
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
      const facing = ((restingBuilding?.rotation || 0) * Math.PI) / 2;
      g.position.copy(
        world(
          door.x - Math.sin(facing) * inward * travel,
          door.z - Math.cos(facing) * inward * travel,
        ),
      );
      // Duck beneath the ridge while passing through the open tent door.
      // Keep the entrance animation on the actual foundation elevation.
      g.rotation.y = facing + (r.tentPhase === "exit" ? 0 : Math.PI);
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
    const crossing = crossingAt(s, visual.people[i].x, visual.people[i].z);
    if (crossing)
      target.y =
        world(
          crossing.x + (footprint(crossing)[0] - 1) / 2,
          crossing.z + (footprint(crossing)[1] - 1) / 2,
        ).y +
        bridgeDeckHeight(crossing, visual.people[i].x, visual.people[i].z);
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
        kitchen: [-1.55, 1.87],
        "wash-station": [0, 0.52],
      }[PROJECTS[service.key].kind];
    const offset = new THREE.Vector3();
    if (
      anchor &&
      !r.walk.length &&
      Math.hypot(
        r.x - buildingFront(service).x,
        r.z - buildingFront(service).z,
      ) < 0.6
    ) {
      const center = world(
        service.x + (footprint(service)[0] - 1) / 2,
        service.z + (footprint(service)[1] - 1) / 2,
      );
      offset
        .copy(center)
        .add(
          new THREE.Vector3(anchor[0], 0, anchor[1]).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            ((service.rotation || 0) * Math.PI) / 2,
          ),
        )
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
    const visit=r.needTask;
    if(visit?.private && visit.elapsed>0 && !r.walk.length) {
      const site=s.projects.find(p=>p.id===visit.site);
      if(site) {
        const center=world(site.x+(footprint(site)[0]-1)/2,site.z+(footprint(site)[1]-1)/2);
        const amount=Math.min(1,visit.elapsed,visit.duration-visit.elapsed);
        g.position.lerp(center,Math.max(0,amount));
      }
    }
    const motion = r.walk.length
      ? r.cargo
        ? "carry-walk"
        : "walk"
      : visit?.animation
        ? (visit.private ? "duck-walk" : visit.animation)
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
  fitTerrainCamera(camera, controls.target, scene.fog);
  // Keep the shadow volume over the viewed land, not the world origin.
  // Moving light and target together preserves the time-of-day sun direction.
  const shadowExtent = Math.max(32, Math.hypot(camera.right - camera.left, camera.top - camera.bottom) / (2 * camera.zoom) + 20);
  sun.position.sub(sun.target.position).normalize().multiplyScalar(400);
  sun.target.position.copy(controls.target);
  sun.position.add(sun.target.position);
  Object.assign(sun.shadow.camera, { left: -shadowExtent, right: shadowExtent,
    top: shadowExtent, bottom: -shadowExtent, near: 1, far: 900 });
  sun.shadow.camera.updateProjectionMatrix();
  drawUtilities();
  renderer.render(scene, camera);
  recordPerformance(now, visual.time);
  requestAnimationFrame(frame);
}
addEventListener("pagehide", persist);
requestAnimationFrame(frame);

installAudio();
