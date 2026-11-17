import {forecast,weatherText} from './weather.js';
import {ensureCultivation} from './cultivation.js';
import {cultivationSignature,createCultivationModel} from './cultivation-models.js';
import {installFarmingUI} from './cultivation-ui.js';
import {GATHERING,gatheringStatus} from './gathering.js';
import {returnPickup,pickupFare} from './physical-trade.js';
import {foodPortions} from './food-storage.js';
import {supplierError} from './supplier-stock.js';
import {activeTrips} from "./trip-state.js";
import {setOutsideWork,outsideWorkText} from "./outside-work.js";
import {constructionSpecText} from './construction-specs.js';
import {spendableMoney} from './procurement-budget.js';
import {tradeQuote,transportCost,pendingExports} from './physical-trade.js';
import {installLenses} from './lenses.js';
import {simulationFrame, restoredView, wasteWarnings, operationalStatus, buildingBenefit} from './session-ui.js';
import {productionTarget} from './economy-policies.js';
import {eventHistory, eventTime} from './event-history.js';
import {PANEL_SHORTCUTS, MANAGEMENT_SHORTCUTS, SPEED_SHORTCUTS, ignoreGameShortcut} from './keyboard-shortcuts.js';
import {projectLabel, upgradeAction, undoRoadPlan, productionSearchText, productionActivity, residentProject} from './project-ui.js';
import { availableHomes, homeResidents, assignHome } from './simulation.js';
import { createScalePreview } from './scale-preview.js';
import { METRES_PER_CELL } from '../library/scale.js';
import { bridgeWidthScale, siteDimensions, projectDescription } from './site-space.js';
import { accessGeometry } from './building-access.js';
import { productionBlocker, buildingOperatingStatus } from './simulation.js';
import { disabledReason, installDisabledInfo } from './disabled-info.js';
import { protectedEquipment } from './equipment.js';
import {loadVillage} from './load-village.js';
import {ensureNaturalLand,TREE_SPECIES} from './natural-resources.js';
import {createFoliageWind} from './foliage-wind.js';
import {saveSlots} from "./save-slots.js";
import {installSaveDialog} from "./save-dialog.js";
import {createCapybaraVisitors} from "./capybaras.js";
import { constructionProgress } from "./construction-logistics.js";
import { BUILD_CATEGORIES, buildingCategory, inBuildCategory } from "./build-categories.js";
import {createResourceTrends,resourceSnapshot,formatTrend} from './resource-trends.js';
import {materialTooltip} from './material-tooltip.js';
import {createWildlife} from './wildlife.js';
import {installAudio} from './audio.js';
import {settingsFor,BIOMES,richnessFactor} from './world-settings.js';
import {beginArrival} from './simulation.js';
import {depositCapacity} from './land-layout.js';
import {profileFor,friendshipLabel} from './resident-personality.js';
import {conversationMotion} from './resident-motion.js';
import {downtimeMotion,downtimeLabel} from './resident-downtime.js';
import {currentThought,aspirationStatus} from './resident-mind.js';
import { needMeters } from "./resident-needs.js";
import { drapeRoadGeometry } from "./road-surface.js";
import { terraform } from "./terraform.js";
import { roadLine } from "./placement-helpers.js";
import { prepareHouseLighting, updateHouseLighting, selectBuildingLights } from "./house-lighting.js";
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
  enableFastNavigation,
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
  moveProject, removeProject,
  prioritize,
  cancelProject, cancelProjectError,
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
const scalePreview = new URLSearchParams(location.search).has("scale-preview");
const wildlifePreview = new URLSearchParams(location.search).has("wildlife-preview");
const downtimePreview = new URLSearchParams(location.search).has("downtime-preview");
const needsPreview = new URLSearchParams(location.search).has("needs-preview");
const utilitiesPreview = needsPreview || downtimePreview || new URLSearchParams(location.search).has(
  "utilities-preview",
);
const restPreview = new URLSearchParams(location.search).has("rest-preview");
const arrivalPreview =
  scalePreview ||
  wildlifePreview ||
  utilitiesPreview ||
  restPreview ||
  new URLSearchParams(location.search).has("arrival-preview");
let s = scalePreview ? createScalePreview(false,new URLSearchParams(location.search).get("scale-preview")) : utilitiesPreview
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
if (downtimePreview) {
  s.log=['Downtime preview: personal activities and fireside company. This scene is not saved.'];
  s.time=1300;s.rain=false;s.rainSeen=true;s.rainResolved=true;
  s.people.forEach((r,i)=>{
    r.x=[32,34,33,32,34][i];r.z=[35,35,36,36,36][i];r.energy=95;
    r.needs={hunger:95,bladder:95,bowels:95,hygiene:95,social:[70,95,75,95,95][i],fun:85};
  });
}
if (restPreview) for (const resident of s.people) resident.energy = 10;
let loadFailure = false;
try {
  if (!arrivalPreview) {
    const loaded=loadVillage(localStorage,SAVE,restore);
    if(loaded) s=loaded;
  }
} catch { loadFailure=true; }
if(loadFailure) {
  location.replace('./menu.html?load-error=1');
  throw new Error('Save could not be restored. Original data preserved; autosaving blocked.');
}
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
enableFastNavigation(s);
const savedView = restoredView(s.view);
let speed = savedView?.speed || 1,
  paused = lightingPreview || scalePreview || savedView?.paused || false,
  placing = null,
  moving = null,
  selected = null,
  lastUI = 0,
  lastSave = 0;
const scene = new THREE.Scene();
const foliageWind=createFoliageWind();
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
renderer.toneMappingExposure = 1.08;
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
const daylight = new THREE.HemisphereLight("#e4eff6", "#777455", 1.4);
scene.add(daylight);
const sun = new THREE.DirectionalLight("#ffe2a8", 3.4);
sun.position.set(-25, 45, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
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
  cloudCover += ((s.weather?.cloudCover ?? (s.rain ? 1 : 0)) - cloudCover) * (1 - Math.exp(-dt / 3));
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
let accessRoad = compactModel(createAccessRoad(s.elevationSeed, s.terrainPads));
scene.add(accessRoad);
const river = createRiver(s.landSeed);
let riverTime=0;
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
    (x - 32) * METRES_PER_CELL,
    elevationAt((x - 32) * METRES_PER_CELL, (z - 32) * METRES_PER_CELL, s.elevationSeed, s.terrainPads),
    (z - 32) * METRES_PER_CELL,
  );
}
function prop(id, x, z, rotation = 0) {
  const model=createAsset(id, Math.round(x * 971 + z * 7919 + s.landSeed));
  const rooftop=model.getObjectByName('optional-rooftop-solar');
  if(rooftop){rooftop.removeFromParent();rooftop.geometry.dispose();}
  const g = compactModel(model);
  if(TREE_SPECIES[id])foliageWind.apply(g);
  g.position.copy(world(x, z));
  g.rotation.y = rotation;
  scene.add(g);
  return g;
}
// Natural trees and deposits are persistent, selectable world objects.
ensureNaturalLand(s,PROJECTS);
const scenery = new THREE.Group();scene.add(scenery);
// Keep low vegetation biome-specific; harvestable trees live in the simulation.
const undergrowthRandom=landRandom(s.landSeed^0x51f92);
const undergrowth=BIOMES[settingsFor(s.landSeed).biome].trees.filter(id=>!PROJECTS[`wild-${id}`]);
const groundPlants=undergrowth.length?undergrowth:['landscape-7','landscape-0'];
for(let i=0;i<100;i++){
  const x=32+(undergrowthRandom()-.5)*120,z=32+(undergrowthRandom()-.5)*120;
  if(Math.hypot(x-s.stock.x,z-s.stock.z)<9 || riverBankAt(x,z,1,s.landSeed)||accessRoadAt(x,z,2))continue;
  scenery.add(prop(groundPlants[Math.floor(undergrowthRandom()*groundPlants.length)],x,z,undergrowthRandom()*Math.PI*2));
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
  const lit = selectBuildingLights(sys.nodes, buildings, controls.target, world);
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
    if (!p) {
      light.intensity = 0;
      continue;
    }
    light.position.copy(
      world(p.x + (footprint(p)[0] - 1) / 2, p.z + (footprint(p)[1] - 1) / 2),
    );
    const entry = buildings.get(p.id);
    const hasWindows = entry?.houseLighting?.panes.length > 0;
    light.distance = hasWindows ? 5 : 10;
    if (hasWindows) {
      const spill = entry.houseLighting.spill.clone();
      entry.root.updateWorldMatrix(true, false);
      light.position.copy(entry.root.localToWorld(spill));
    } else light.position.y += n.kind === "streetlight" ? 2.7 : 1.6;
    light.intensity =
      night * (n.enabled ? n.power || 0 : 0) * (hasWindows ? 3.5 : 12);
  }
}
const buildings = new Map();
let selectedFieldEdge=null;
const selectionOutline = new THREE.BoxHelper(new THREE.Object3D(), '#3b6545');
selectionOutline.material.depthTest = false;
selectionOutline.renderOrder = 20;
selectionOutline.frustumCulled = false;
selectionOutline.visible = false;
scene.add(selectionOutline);
const assets = new Set(ASSETS.map((a) => a.id));
let terrainPadCount = s.terrainPads?.length || 0, terrainLayer = s.terrainPads;
function syncTerrain() {
  if (terrainLayer === s.terrainPads && terrainPadCount === (s.terrainPads?.length || 0)) return;
  terrainLayer = s.terrainPads;
  terrainPadCount = s.terrainPads.length;
  updateTerrain(ground, s.elevationSeed, s.terrainPads);
  scene.remove(accessRoad);
  disposeModel(accessRoad);
  accessRoad = compactModel(createAccessRoad(s.elevationSeed, s.terrainPads));
  scene.add(accessRoad);
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
  const ids = new Set(s.projects.map(p => p.id));
  for (const [id, entry] of buildings) if (!ids.has(id)) {
    scene.remove(entry.root);
    disposeModel(entry.root);
    buildings.delete(id);
  }
  syncTerrain();
  ground.userData.surface.update(s.projects,PROJECTS,footprint);
  autoConnectUtilities(s, PROJECTS);
  for (const p of s.projects) {
    const def = PROJECTS[p.key],
      fraction = p.work / def.work;
    const cultivation=fraction>=1&&ensureCultivation(s,p);
    const farmSignature=cultivation&&cultivationSignature(p,s);
    let id =
      p.key === "gathering" && fraction < 0.35 ? "produce-crates" : def.asset;
    if(GATHERING[p.key]&&(p.readyAt>s.time||(GATHERING[p.key].gatherLimit&&(p.extracted||0)>=GATHERING[p.key].gatherLimit)))id+='-gathered';
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
      entry.farmSignature !== farmSignature ||
      (p.key === "road" &&
        entry.groundKey !== `${p.x},${p.z},${p.rotation || 0}`)
    ) {
      if (entry) {
        scene.remove(entry.root);
        disposeModel(entry.root);
      }
      const root = cultivation ? createCultivationModel(p,s) : prop(
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
      if(cultivation)scene.add(root);
      root.userData.projectId = p.id;
      entry = {
        root,
        asset: id,
        farmSignature,
        animals: collectAnimals(root),
        groundKey: `${p.x},${p.z},${p.rotation || 0}`,
      };
      if (fraction >= 1)
        entry.houseLighting = prepareHouseLighting(root);
      buildings.set(p.id, entry);
    }
    entry.root.position.copy(
      world(p.x + (footprint(p)[0] - 1) / 2, p.z + (footprint(p)[1] - 1) / 2),
    );
    entry.root.scale.z = bridgeWidthScale(p);
    entry.root.rotation.y = ((p.rotation || 0) * Math.PI) / 2;
    entry.root.visible=!p.felled;

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
    if(def.kind==='home') {
      if(fraction>=1 && p.solarUpgrade && !entry.solarPanel){
        const panel=box(entry.root,1.2,.07,.8,'#436b79',-.8,3.2,.6);
        if(def.size[0]>2)panel.rotation.x=Math.atan2(1.05,1.78);
        else panel.rotation.z=Math.atan2(1.05,1.95);
        entry.solarPanel=panel;
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
const accessPreview=new THREE.Group();scene.add(accessPreview);
let accessPreviewKey=null,placementPreviewPending=false;
function previewAccess(key,x,z,rotation){
  if(key!==accessPreviewKey){
    for(const child of [...accessPreview.children]){child.geometry.dispose();child.material.dispose();accessPreview.remove(child);}
    accessPreviewKey=key;
  }
  if(!key||['road','bridge'].includes(key))return;
  const p={key,x,z,rotation,work:PROJECTS[key].work};
  const geometry=accessGeometry(p,PROJECTS[key],footprint(p));
  let index=0;
  for(const [points,color,radius] of [[geometry.work,'#55b9d8',.24],[geometry.entrances,'#f3be55',.38]])for(const point of points){
    const marker=accessPreview.children[index++]||new THREE.Mesh(new THREE.RingGeometry(radius,radius+.08,24),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:false}));
    marker.rotation.x=-Math.PI/2;marker.position.copy(world(point.x,point.z));marker.position.y+=.12;marker.renderOrder=10;if(marker.parent!==accessPreview)accessPreview.add(marker);
  }
}

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
focus(scalePreview ? (new URLSearchParams(location.search).get("scale-preview")==="new-homes"?{x:62,z:53}:new URLSearchParams(location.search).get("scale-preview")==="homes"?{x:63,z:52}:{x:56,z:57}) : s.arrivalAnimating ? s.stock : campLocation(s));
if (savedView) {
  camera.position.fromArray(savedView.position);
  controls.target.fromArray(savedView.target);
  camera.zoom = savedView.zoom;
  camera.updateProjectionMatrix();
  controls.update();
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
let messageTimer;
function message(t) {
  clearTimeout(messageTimer);
  t ||= '';
  if ($("message").textContent !== t) $("message").textContent = t;
  $("message").hidden = !t;
  $("management-message").textContent = t;
  if (t && !placing && s.stage !== 'arrival' && !s.arrivalAnimating)
    messageTimer = setTimeout(() => { $("message").textContent = ''; $("message").hidden = true; }, 6000);
}
let activeSaveSlot;
try { activeSaveSlot=saveSlots(localStorage).active(s.mode||"story"); } catch {}
function viewPauseState() {
  if (document.querySelector('.village-saves[open]')) return savesWasPaused;
  if ($('controls-dialog').open) return controlsWasPaused;
  if (management?.isOpen) return management.resumePaused;
  if (openPanel) return openPanel === 'people' ? residentsWasPaused : trayWasPaused;
  return roadWasPaused ?? paused;
}
function saveWithView(pauseState = viewPauseState()) {
  return save({...s, view: {speed, paused: pauseState, position: camera.position.toArray(), target: controls.target.toArray(), zoom: camera.zoom}});
}
function persist() {
  if (arrivalPreview) return;
  try {
    saveSlots(localStorage).autosave(s.mode || "story", saveWithView(), activeSaveSlot);
  } catch {
    message(
      "Progress cannot be saved in this browser. Keep this tab open to continue.",
    );
  }
}
let lastRoad = null,
  shiftPlacement = false;
let roadWasPaused = null, roadHistory = [], roadsExpanded = false;
let placementRotation = 0,
  wireframe = null;
const entranceMarker = new THREE.Mesh(new THREE.RingGeometry(.5,.9,32), new THREE.MeshBasicMaterial({color: '#d83b23', side: THREE.DoubleSide, depthTest:false}));
entranceMarker.rotation.x = -Math.PI/2;
entranceMarker.renderOrder = 100;
entranceMarker.visible = false;
scene.add(entranceMarker);
const rotateButton = $("rotate-placement");
function rotatePlacement(direction = 1) {
  if (!placing) return;
  placementRotation = (placementRotation + direction + 4) % 4;
  rotateButton.textContent = `Rotate · R · ${placementRotation * 90}°`;
  updatePlacementPreview();
}
rotateButton.onclick = () => rotatePlacement();
function cancel() {
  const wasRoad = placing === 'road';
  placing = null;
  moving = null;
  lastRoad = null;
  roadPreview.visible = false;
  if (wireframe) wireframe.visible = false;
  rotateButton.hidden = true;
  ghost.visible = false;
  $("cancel").hidden = true;
  $("undo-road").hidden = true;
  roadHistory = [];
  if (roadWasPaused !== null) { paused = roadWasPaused; roadWasPaused = null; updatePauseButton(); }
  grid.visible = false;
  message(wasRoad ? 'Road planning finished. Planned tiles kept.' : '');
  renderUI();
}
function startPlacement(key, id = null) {
  if (placing) cancel();
  if (openPanel === "terrain-panel") setPanel(null);
  lastRoad = null;
  roadPreview.visible = false;
  placing = key;
  moving = id;
  if (key === 'road' && !id) { roadWasPaused = paused; paused = true; updatePauseButton(); }
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
  model.scale.z = bridgeWidthScale(s.projects.find(p => p.id === id) || {key});
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
  $("cancel").textContent = key === 'road' ? 'Finish planning · Esc' : 'Cancel placement · Esc';
  $("undo-road").hidden = key !== 'road' || !!id;
  $("undo-road").disabled = true;
  grid.visible = true;
  message(
    key === "bridge"
      ? "Span the river with both ends on dry land. R rotates. Esc cancels."
      : key === "road"
        ? "Road planning paused · Shift-click extends · Undo removes the last stroke · Esc keeps the plan."
        : "Choose a building site. R rotates. Shift-click repeats. Ground levels automatically. Esc cancels.",
  );
  renderUI();
}

const buildMaterialTooltip = materialTooltip();
for (const [key, d] of Object.entries(PROJECTS)) {
  if(d.natural)continue;
  const b = document.createElement("button");
  b.id = `build-${key}`;
  const count = Object.values(d.materials).reduce((a, b) => a + b, 0);
  b.innerHTML = `<span class="material-warning" aria-hidden="true">!</span><img class="build-art" alt=""/><strong>${d.name}</strong><span class="build-cost">${s.mode === "sandbox" ? "Free" : `${count} materials`} <i>· ${d.size.join("×")}</i></span>`;
  b.setAttribute("aria-label", `${d.name}. ${recipeText(key)}`);
  b.title = `${d.description} ${constructionSpecText(d)}`;
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
let fieldGridPrevious=null;
let farmingUI=installFarmingUI({state:()=>s,selected:()=>selected,scene,hit,controls,
  placementGrid:active=>{if(active){fieldGridPrevious??={visible:grid.visible,opacity:grid.material.opacity,transparent:grid.material.transparent};grid.visible=true;grid.material.transparent=true;grid.material.opacity=.35;}else if(fieldGridPrevious!==null){grid.visible=fieldGridPrevious.visible;grid.material.opacity=fieldGridPrevious.opacity;grid.material.transparent=fieldGridPrevious.transparent;fieldGridPrevious=null;}},
  select:id=>{selected=id;syncBuildings();persist();renderUI();},
  changed:()=>{syncBuildings();persist();renderUI();},message,
  begin:()=>{placing=null;setPanel(null);ghost.visible=false;},
});
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
    entranceMarker.visible = false;
    if (wireframe) wireframe.visible = false;
    roadPreview.visible = false;
    return;
  }
  const nextCell={x:Math.round(p.x/2+32),z:Math.round(p.z/2+32)};
  if(cell?.x===nextCell.x&&cell?.z===nextCell.z&&shiftPlacement===e.shiftKey&&(ghost.visible||wireframe?.visible))return;
  shiftPlacement = e.shiftKey;
  cell = nextCell;
  if(!placementPreviewPending){placementPreviewPending=true;requestAnimationFrame(()=>{placementPreviewPending=false;updatePlacementPreview();});}
});
function updatePlacementPreview() {
  if (!cell) return;
  const pitching =
    !placing && s.stage === "arrival" && s.arrivalElapsed >= ARRIVAL_DURATION;
  if (!placing && !pitching) return;
  const size = pitching
    ? [5, 4]
    : footprint({ ...s.projects.find(p => p.id === moving), key: placing, rotation: placementRotation });
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
  const placementDetails = {};
  previewAccess(placing,cell.x,cell.z,placementRotation);
  const error = pitching
    ? campPlacementError(s, cell.x, cell.z)
    : placementError(s, placing, cell.x, cell.z, moving, placementRotation, placementDetails);
  entranceMarker.visible = !!placementDetails.entrance;
  if (placementDetails.entrance) entranceMarker.position.copy(world(placementDetails.entrance.x, placementDetails.entrance.z)).add(new THREE.Vector3(0,.15,0));
  roadPreview.visible = false;
  let hint = error;
  if (placing) {
    const missing = moving ? [] : missingMaterials(s, placing);
    const purchase = blueprintPurchase(s, placing);
    hint ||= missing.length ? purchase.error || `Place to buy missing materials for R$${purchase.cost.toFixed(2)} · ${s.trip ? "Pickup queued after current trip" : "Resident pickup arranged automatically"}` : "";
    if (placing === "road" && shiftPlacement && lastRoad) {
      const line = roadLine(lastRoad, cell);
      if (!line) hint = "Choose a shorter road route (up to 128 cells).";
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
        `${PROJECTS[placing].name} · Site ${siteDimensions(size)} · ${placementRotation * 90}° · ${placing === "road" ? "Shift-click extends roads" : "R rotates · Shift-click repeats · Gold: entrance · Blue: work access"}`,
    );
  } else if (hint) message(hint);
  ghost.material.color.set(error ? "#c26847" : "#d9eda5");
  if (!pitching && wireframe) {
    // Keep the reservation visible beneath the physical object wireframe.
    ghost.visible = true;
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
    message("Camp is ready. Choose what your community needs first.");
    ghost.visible = false;
    focus(campLocation(s));
    persist();
    renderUI();
    return;
  }
  if (placing) {
    const roadBefore = placing === 'road' && !moving ? {before: structuredClone(s), lastRoad} : null;
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
    if (roadBefore) {
      roadHistory.push({...roadBefore, after: JSON.stringify(s)});
      $("undo-road").disabled = false;
    }
  } else {
    // Pick the visible model, including a tree's canopy, before falling back to its cell.
    const modelHit=ray.intersectObjects([...buildings.values()].filter(b=>b.root.visible).map(b=>b.root),true)[0];
    let picked=modelHit?.object;
    while(picked && !picked.userData.projectId)picked=picked.parent;
    selected = picked?.userData.projectId ||
      s.projects.find(
        (p) =>
          !p.felled && x >= p.x &&
          x < p.x + footprint(p)[0] &&
          z >= p.z &&
          z < p.z + footprint(p)[1],
      )?.id || null;
    if (selected && lenses.active && openPanel) setPanel(null);
    renderUI();
  }
});
$("cancel-project").onclick = () => {
  const error = cancelProject(s, selected);
  if (!error) { selected = null; syncBuildings(); persist(); }
  message(error || s.log[0]);
  uiSignature = ''; renderUI();
};
let controlsWasPaused = false;
$("show-controls").onclick = () => {
  controlsWasPaused = paused; paused = true; updatePauseButton();
  $("controls-dialog").showModal();
};
$("close-controls").onclick = () => $("controls-dialog").close();
$("controls-dialog").addEventListener('close', () => { paused = controlsWasPaused; updatePauseButton(); });
$("priority").onclick = () => {
  prioritize(s, selected);
  message(s.log[0]);
  renderUI();
};
for(const mode of ["salvage","demolish"])$(mode+"-building").onclick=()=>{const error=removeProject(s,selected,mode);message(error||"Resident dismantling queued.");uiSignature="";renderUI();};
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
  if (openPanel === "projects-panel") setPanel(null);
  else renderUI();
};
$("cancel").onclick = cancel;
$("undo-road").onclick = () => {
  const entry = roadHistory.at(-1);
  if (!undoRoadPlan(s, entry)) {
    message("The village changed since this stroke. Finish planning to keep the current plan.");
    return;
  }
  roadHistory.pop();
  lastRoad = entry.lastRoad;
  syncBuildings();
  uiSignature = "";
  renderUI();
  persist();
  if (roadHistory.length) roadHistory.at(-1).after = JSON.stringify(s);
  $("undo-road").disabled = !roadHistory.length;
  message("Last road stroke undone.");
};
addEventListener("keyup", (e) => {
  if (e.key === "Shift") {
    shiftPlacement = false;
    roadPreview.visible = false;
  }
});
addEventListener("keydown", (e) => {
  const dialogOpen = !!document.querySelector('dialog[open]');
  const editing = e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  if (e.key === "Shift" && !editing && !dialogOpen) {
    shiftPlacement = true;
    updatePlacementPreview();
  }
  // Escape belongs to the topmost dialog, including saves and confirmations.
  if (e.key === "Escape" && !dialogOpen) {
    if (editing && e.target.type === 'search' && e.target.value) {
      e.preventDefault();
      e.target.value = '';
      e.target.dispatchEvent(new Event('input', {bubbles: true}));
      return;
    }
    if (placing) cancel();
    else if (selected) { selected = null; uiSignature = ''; renderUI(); }
    else if (openPanel) setPanel(null);
    else document.querySelector('.view-menu').open = false;
    $("world").focus({preventScroll: true});
    return;
  }
  // Search remains available inside Resources, but never steals typed text.
  if (e.code === 'Slash' && !e.shiftKey && !ignoreGameShortcut(e) &&
      (!dialogOpen || $("management").open && management.view === 'resources')) {
    e.preventDefault();
    if (!dialogOpen) {
      if (s.stage !== 'playing') return;
      setPanel('build');
    }
    const input = $(dialogOpen ? 'resource-search' : 'build-search');
    input.focus(); input.select();
    return;
  }
  if (ignoreGameShortcut(e, dialogOpen)) return;
  if (e.code === 'KeyR' && placing) {
    e.preventDefault(); rotatePlacement(e.shiftKey ? -1 : 1); return;
  }
  if (e.shiftKey) return;
  const panel = PANEL_SHORTCUTS[e.code], screen = MANAGEMENT_SHORTCUTS[e.code];
  if ((panel || screen) && s.stage === 'playing') {
    e.preventDefault();
    $("world").focus({preventScroll: true});
    if (panel) setPanel(openPanel === panel ? null : panel);
    else management.open(screen);
    if (!document.querySelector('dialog[open]')) $("world").focus({preventScroll: true});
  } else if (SPEED_SHORTCUTS[e.code]) {
    e.preventDefault(); setSpeed(SPEED_SHORTCUTS[e.code]);
  } else if (e.code === 'KeyG') {
    e.preventDefault(); $("grid").click();
  } else if (e.code === 'KeyF') {
    e.preventDefault();
    if (selected) $("focus-selection").click();
    else focus(campLocation(s));
  } else if (e.code === 'Space' && !e.target.closest?.('button,summary,a')) {
    e.preventDefault(); $("pause").click();
  }
});

$("town").onclick = () => {
  if (supplyRun(s, $("purchase").value)) {
    message(s.log[0]);
    persist();
    renderUI();
  } else {
    message("Town pickups depart between 07:00 and 18:00. A rested resident with no urgent needs and an available car are required. Check storage space and savings, then try again.");
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
  if (roadWasPaused !== null) { cancel(); return; }
  paused = !paused;
  updatePauseButton();
};
function setSpeed(value) {
  speed = value;
  $("speed").textContent = `${speed}×`;
  $("speed").setAttribute('aria-label', `Simulation speed ${speed}×. Keys 1 to 4 select speed.`);
}
setSpeed(speed);
$("speed").onclick = () => setSpeed([1,4,8,16][([1,4,8,16].indexOf(speed)+1)%4]);
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
installSaveDialog($("saved-villages"), {onSaved:slot=>{activeSaveSlot=slot.id;},current:()=>({mode:s.mode||'story',data:saveWithView(savesWasPaused)}),beforeOpen:()=>{if(placing)cancel();savesWasPaused=paused;paused=true;updatePauseButton();},afterClose:()=>{paused=savesWasPaused;updatePauseButton();}});
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
  // Keep the old named village intact; a new world must not autosave into it.
  try {
    const slots=saveSlots(localStorage),mode=s.mode||'story';
    slots.autosave(mode,save(s),activeSaveSlot);
    slots.detach(mode);
    activeSaveSlot=null;
  } catch {
    message('Could not preserve the current save. Free some storage before starting again.');
    return;
  }
  // pagehide also saves: replace live state before navigating so it cannot resurrect the old camp.
  const seed = freshLandSeed();
  s = s.mode === "sandbox" ? createSandbox(seed) : createWeekend(seed);
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
  const warnings = nodes.flatMap(n => wasteWarnings(n).map(text => `${labels.find(([id])=>id===n.id)?.[1]}: ${text}`));
  $("tank-attention").hidden = !warnings.length;
  $("tank-attention").textContent = `${warnings.length} waste tank${warnings.length===1?' needs':'s need'} attention`;
  $("tank-attention").title = warnings.join('\n');
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
          .filter(([id, d]) => d.kind === PROJECTS[p.key].kind && !(p.cultivation&&['baby_greens','vegetables','greenhouse'].includes(id)))
          .map(([id, d]) => [id, d.name])
      : [],
  );
  const activity = p && productionActivity(s, p, PROCESSES);
  $("production-progress").hidden = !activity;
  $("production-progress").value = activity?.progress || 0;
  $("production-activity").textContent = activity?.detail || "";
  $("production-activity").hidden = !activity;
  $("production-controls").hidden = !$("production").value;
  $("queue-production").disabled = !node || node.enabled === false || !$("production").value;
  const upgrade = p && $("production").value === "solar_upgrade" ? upgradeAction(p, s.operations || []) : null;
  $("repeat-production").hidden = !!upgrade || (!!p && PROJECTS[p.key].kind==='wild-tree');
  $("queue-production").textContent = p && PROJECTS[p.key].kind==='wild-tree' ? 'Cut this tree' : p && PROJECTS[p.key].natural ? 'Gather resources' : 'Start batch';
  if (node?.enabled === false) $("queue-production").textContent = "Switch on to produce";
  if (activity) { $("queue-production").textContent = activity.label; $("queue-production").disabled = true; }
  if (upgrade) { $("queue-production").textContent = upgrade.label; $("queue-production").disabled ||= upgrade.disabled; }
  const batchBlocker=productionBlocker(s,selected,$("production").value);
  disabledReason($("queue-production"),batchBlocker);
  $("queue-production").disabled ||= !!batchBlocker;
  $("repeat-production").disabled = !node || !$("production").value;
  $("repeat-production").textContent = p?.repeat
    ? "Stop repeating"
    : `Keep ${productionTarget(p || {})} in stock`;
  $("toggle-building").hidden = !canSwitchBuilding(sys,node);
  disabledReason($("toggle-building"), "This structure has no switchable service.");
  $("toggle-building").disabled = !canSwitchBuilding(sys,node);
  $("toggle-building").textContent = node?.enabled ? "Switch off" : "Switch on";
  const op = p && (s.operations || []).find((o) => o.site === p.id && !o.done && !o.water);
  $("building-service").textContent = node
    ? `${hasPowerService(sys,node) ? node.enabled === false ? "Switched off" : `Power ${(node.power * 100).toFixed(0)}%` : ""}${node.battery ? ` · Battery ${node.charge.toFixed(1)}/${node.battery} kWh` : ""}${hasPowerService(sys,node) ? ". " : ""}${LIQUIDS.map(
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
  if(p){const status=buildingOperatingStatus(s,p);$("building-service").textContent=`${status.state}: ${status.reason} · ${$("building-service").textContent}`;}
  const recipe=PROCESSES[$("production").value];
  if(p&&recipe?.gathering)$("building-service").textContent+=` · ${gatheringStatus(s,p)}`;
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
      ? "Sale queued. A resident will take the reserved goods to town; payment is received there."
      : tradeQuote(s,$("purchase").value,MATERIALS,materialCount).error || "Sale unavailable.",
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
    if(!button)continue;
    // Search the entire catalogue, even when a category was selected earlier.
    button.hidden=query ? !`${productionSearchText(d, PROCESSES, MATERIALS)} ${buildingCategory(d)}`.toLowerCase().includes(query)
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
let openPanel = null, flattenLevel = null, residentsWasPaused = false, trayWasPaused = false;
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
  disabledReason($("terrain-undo"), "There are no terrain edits to undo in this session.");
  $("terrain-undo").disabled = !terrainHistory.length;
  message("Terrain edit undone.");
};
function setPanel(panel) {
  if(openPanel && openPanel!=='people'){paused=trayWasPaused;updatePauseButton();}
  if (placing) cancel();
  if(panel && panel!=='people'){trayWasPaused=paused;paused=true;updatePauseButton();}
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
let arrivalMessageShown = false;
function renderUI() {
  farmingUI?.refresh();
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
    s.events,
    s.people.map((r) => [r.home, r.action, r.job, r.cargo, r.haulLoads, r.tentPhase, r.needTask?.label, r.needBlocked, Math.floor(r.work/10), JSON.stringify(r.friendships), JSON.stringify(r.mind), downtimeLabel(r), r.needTask?.elapsed>0, ...needMeters(r).map(([,value])=>Math.round(value))]),
    s.projects.map((p) => [
      p.id, p.delivered, p.staged, p.pendingMaterials,
      Math.floor((p.work / PROJECTS[p.key].work) * 100),
    ]),
  ]);
  if (signature === uiSignature) return;
  uiSignature = signature;
  const active = s.stage !== "arrival" && !s.arrivalAnimating;
  if (active && arrivalMessageShown) message("");
  arrivalMessageShown = !active;
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
    ["money", `R$${s.money.toFixed(2)}`, "Savings", "finances"],
    ["meals", `${foodPortions(s)}`, "Food portions", "resources"],
    [
      "power",
      `${Object.values(s.infrastructure?.nodes || {}).reduce((a,n)=>a+(n.charge||0),0).toFixed(1)}`,
      "Battery · kWh",
      "power",
    ],
    [
      "water",
      Math.floor(Object.values(s.infrastructure?.nodes||{}).reduce((sum,n)=>sum+n.water[0],0)),
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
    if (i === 0) { button.dataset.shortcut = 'M'; button.setAttribute('aria-keyshortcuts', 'M'); }
    const trend=button.querySelector('.resource-trend');
    const unlimited=s.mode==='sandbox'&&i<3;
    trend.textContent=unlimited?'Unlimited':formatTrend(rate,i===0);
    trend.dataset.direction=rate>.05?'up':rate<-.05?'down':'flat';
    button.title=`Open ${counter[3]} management. ${unlimited?'Unlimited in sandbox.':rate===null?'Gathering trend data (first five in-game minutes).':`${i===2?'Stored energy':counter[2]}: ${formatTrend(rate,i===0)} net change over the last in-game hour, or time observed since loading. Includes spending, consumption and deliveries.`}`;
    disabledReason(button, "Wait for the residents to arrive and choose a campsite to manage village supplies.");
    button.disabled = !active;
  });
  const minutes = 9 * 60 + Math.floor(s.time * 0.45);
  $("clock").textContent =
    s.stage === "evening"
      ? "Saturday · Evening"
      : `Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  $("weather-summary").textContent=weatherText(s);
  $("weather-forecast").textContent=forecast(s).map(d=>`Day ${d.day}: ${d.rain}, ${d.temperature}`).join(" · ");
  $("tasks").replaceChildren();
  $("completed-tasks").replaceChildren();
  const builtCount = s.projects.filter(
    (p) => !p.natural && p.work >= PROJECTS[p.key].work,
  ).length;
  $("completed-panel").hidden = builtCount === 0;
  $("completed-title").textContent = `Around the village · ${builtCount} built`;
  const roads = s.projects.filter(p => p.key === "road");
  let roadGroup;
  if (roads.length) {
    roadGroup = document.createElement("details");
    roadGroup.className = "road-project-group";
    roadGroup.open = roadsExpanded;
    roadGroup.ontoggle = () => { if (roadGroup.isConnected) roadsExpanded = roadGroup.open; };
    const ready = roads.filter(p => p.work >= PROJECTS.road.work).length;
    const summary = document.createElement("summary");
    summary.textContent = `Roads · ${roads.length} tiles · ${ready} ready`;
    roadGroup.append(summary);
    $(ready === roads.length ? "completed-tasks" : "tasks").append(roadGroup);
  }
  for (const p of s.projects) {
    if(p.natural)continue;
    const d = PROJECTS[p.key],
      div = document.createElement("div");
    div.className = "task";
    const b = document.createElement("button");
    const done = p.work >= d.work;
    div.classList.toggle("complete", done);
    const construction = constructionProgress(s, p, d, requiredLoads(p));
    b.innerHTML = `<img alt=""/><span>${projectLabel(p, PROJECTS)}</span><em>${done ? "✓" : construction.phase}</em>`;
    illustrate(b.querySelector("img"), d.asset);
    b.onclick = () => {
      selected = p.id;
      renderUI();
    };
    const progress = document.createElement("progress");
    progress.max = 1;
    progress.value = construction.value;
    progress.setAttribute('aria-label', `${d.name}: ${construction.phase}`);
    div.append(b, progress);
    if (!done) {
      const workStatus = document.createElement("small");
      workStatus.className = "task-work-status";
      workStatus.textContent = `${construction.detail} · ${construction.workers}`;
      div.append(workStatus);
    }
    (p.key === "road" ? roadGroup : $(done ? "completed-tasks" : "tasks")).append(div);
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
              : downtimeLabel(r) ||
                actionText[r.action] ||
                "Settling in";
    if(r.job && r.cargo && r.haulLoads) status.textContent = `Carrying ${r.haulLoads} load${r.haulLoads===1?'':'s'} to ${r.haulStage==='storage'?'nearby storage':PROJECTS[s.projects.find(p=>p.id===r.job)?.key]?.name || 'the building site'}`;
    if(r.action==='service')status.textContent='Servicing village equipment';
    if(r.outsideWork)status.textContent=r.outsideWork.phase==='away'?'Working in town':'Commuting to/from work';
    const jobProject = residentProject(s, r);
    if (jobProject) status.textContent += ` · ${projectLabel(jobProject, PROJECTS)}`;
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
      const locate=document.createElement('button');
      locate.textContent='Find in village';
      locate.setAttribute('aria-label',`Find ${r.name} in village`);
      locate.onclick=()=>{
        setPanel(null);
        focus(r);
        message(`${r.name} · ${status.textContent}`);
      };
      detail.append(locate);
      if (jobProject) {
        const viewJob = document.createElement('button');
        viewJob.textContent = `View project · ${projectLabel(jobProject, PROJECTS)}`;
        viewJob.onclick = () => { setPanel(null); selected = jobProject.id; focus(jobProject); uiSignature = ''; renderUI(); };
        detail.append(viewJob);
      }
      const tabs=document.createElement('nav');tabs.className='resident-tabs';tabs.setAttribute('aria-label','Profile sections');
      for(const label of ['Overview','Story','Skills','Relationships']){
        const tab=document.createElement('button');tab.textContent=label;tab.setAttribute('aria-pressed',String(residentTab===label));
        tab.onclick=()=>{residentTab=label;uiSignature='';renderUI();};tabs.append(tab);
      }
      detail.append(tabs);
      const paragraph=(text,kind='p')=>{const el=document.createElement(kind);el.textContent=text;detail.append(el);};
      if(residentTab==='Overview'){
        const activity=document.createElement('div');activity.className='resident-activity';activity.textContent=status.textContent;detail.append(activity);
        paragraph('Home','h3');
        const homePicker=document.createElement('select');
        homePicker.setAttribute('aria-label',`Assign home for ${r.name}`);
        const campOption=document.createElement('option');campOption.value='';campOption.textContent='Unassigned · use available shelter';homePicker.append(campOption);
        for(const home of availableHomes(s)) {
          const option=document.createElement('option'), occupants=homeResidents(s,home.id), beds=PROJECTS[home.key].beds||2;
          option.value=String(home.id);option.textContent=`${PROJECTS[home.key].name} · (${home.x}, ${home.z}) · ${occupants.length}/${beds} beds`;
          option.disabled=home.id!==r.home && (occupants.length>=beds || s.infrastructure.nodes[home.id]?.enabled===false);
          homePicker.append(option);
        }
        homePicker.value=r.home==null?'':String(r.home);homePicker.disabled=s.stage!=='playing';
        homePicker.onchange=()=>{const error=assignHome(s,r.id,homePicker.value===''?null:Number(homePicker.value));message(error||'Home assignment updated. Applies at the next rest.');uiSignature='';persist();renderUI();};
        detail.append(homePicker);
        const housemates=homeResidents(s,r.home).filter(other=>other!==r);
        if(r.home!=null)paragraph(housemates.length?`Lives with ${housemates.map(other=>other.name).join(', ')}.`:'Lives here alone.');
        else if(!availableHomes(s).length)paragraph('Complete a house to assign a permanent home.');
        paragraph('Needs','h3');detail.append(needs);
        paragraph('Outside work','h3');paragraph(outsideWorkText(r));
        const jobToggle=document.createElement('button');jobToggle.textContent=r.outsideJobEnabled?'Outside work: on':'Outside work: off';jobToggle.setAttribute('aria-pressed',String(!!r.outsideJobEnabled));jobToggle.onclick=()=>{setOutsideWork(s,r,!r.outsideJobEnabled);uiSignature='';renderUI();};detail.append(jobToggle);
        paragraph('On my mind','h3');paragraph(currentThought(s,r,PROJECTS));
        const wish=aspirationStatus(s,r,PROJECTS);
        paragraph('A personal hope','h3');paragraph(`${wish.label} · ${wish.status}`);paragraph(wish.reason);
        paragraph('About '+r.name,'h3');paragraph(profile.bio);
        paragraph(profile.effect);paragraph(`Enjoys ${profile.hobby.toLowerCase()}.`);
        paragraph('Recent memories','h3');
        if(!r.mind?.memories.length)paragraph('Memories will appear after conversations, personal time, and meaningful village milestones.');
        else for(const memory of r.mind.memories.slice(0,3))paragraph(memory.text);
      } else if(residentTab==='Story'){
        paragraph('Before the village','h3');paragraph(profile.backstory);
        for(const [label,text] of [
          ['What I want',profile.desire],['What drives me',profile.motivation],
          ['What I fear',profile.fear],['Where I struggle',profile.flaw],
          ['What I need from others',profile.boundary],['Room to grow',profile.growth],
        ]){paragraph(label,'h3');paragraph(text);}

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
        paragraph('Growing together','h3');paragraph('Residents make time for willing friends, shared interests, and listening. Sleep, urgent needs, and quiet time come first.');
        for(const friend of s.people.filter(p=>p!==r)){
          const score=r.friendships?.[friend.id]||0,row=document.createElement('div');row.className='relationship-row';
          const img=document.createElement('img');illustrate(img,friend.id);img.alt='';
          const text=document.createElement('div');const n=document.createElement('strong');n.textContent=friend.name;
          const label=document.createElement('p');label.textContent=friendshipLabel(score);
          const bar=document.createElement('progress');bar.max=100;bar.value=score;bar.setAttribute('aria-label',`Friendship with ${friend.name}`);
          text.append(n,label,bar);
          const memory=r.mind?.memories.find(m=>m.other===friend.id);
          if(memory){const note=document.createElement('p');note.textContent=memory.text;text.append(note);}
          row.append(img,text);detail.append(row);
        }
      }
      $("resident-detail").append(detail);
    }
    $("roster").append(div);
  }
  const purchase = MATERIALS[$("purchase").value];
  $("town").textContent =
    `${s.deliveryOnly?"Order delivery:":"Fetch"} ${materialText($("purchase").value, purchase.quantity)} · R$${(purchase.price + pickupFare(s)).toFixed(2)} ${returnPickup(s)?"· existing trip, no extra fuel":"incl. transport"}`;
  const townHour=((540+s.time*.45)/60)%24;
  const supplierIssue=(townHour<7||townHour>=18) ? "Town opens at 07:00; pickups stop departing at 18:00. Planned construction and food pickups retry automatically." : supplierError(s,{[$("purchase").value]:purchase.quantity},MATERIALS);
  disabledReason($("town"), supplierIssue || (s.stage !== "playing" ? "Choose a campsite first." : "Wait for an available vehicle or delivery and enough uncommitted savings for supplies and transport."));
  $("town").disabled =
    !!supplierIssue ||     (s.deliveryOnly?!!s.delivery:(!!s.trip&&!!s.secondTrip&&!returnPickup(s))) || spendableMoney(s) < purchase.price + pickupFare(s) || s.stage !== "playing";
  $("inventory").textContent = Object.keys(MATERIALS)
    .map((id) => materialText(id, materialCount(s, id)))
    .join(" · ");
  const sale=tradeQuote(s,$("purchase").value,MATERIALS,materialCount,protectedEquipment(s,$("purchase").value));
  $("sell").textContent =
    `Queue sale: ${materialText($("purchase").value, sale.quantity || 0)} · R$${((sale.cents || 0)/100).toFixed(2)}`;
  $("sell").disabled =
    !!tradeQuote(s,$("purchase").value,MATERIALS,materialCount).error;
  $("sell").title=tradeQuote(s,$("purchase").value,MATERIALS,materialCount).error || "Payment after trading in town; combine batches to share transport costs.";
  const journeys=activeTrips(s).map(trip=>`${s.people.find(r=>r.id===trip.person).name}: ${{boarding:"walking to the car",outbound:"driving to town",away:"trading in town",inbound:"driving home",unloading:"unloading supplies"}[trip.phase]}`);
  if(s.delivery)journeys.push(`Supplier delivery: ${Math.ceil(s.delivery.left*.45)} game minutes remaining`);
  $("trip").textContent = journeys.length?journeys.join(' · '):`Storage: ${Math.round(storedMaterials(s))}/${storageCapacity(s)} units. ${pendingExports(s).length} sale batches waiting. R$${spendableMoney(s).toFixed(2)} available after collection commitments. ${s.deliveryOnly?'Delivery':'Car trip'}: R$${transportCost(s).toFixed(2)}.`;
  const equipmentBlocked = protectedEquipment(s,$("purchase").value)>0 && materialCount(s,$("purchase").value)-protectedEquipment(s,$("purchase").value)<1;
  $("sell").disabled ||= equipmentBlocked;
  disabledReason($("sell"),equipmentBlocked ? "Return borrowed equipment or repair worn equipment before selling it." : $("sell").title);
  $("rain").hidden = !s.rainSeen || s.rainResolved;
  disabledReason($("boards"), `You need 2 timber pieces to protect the supplies; ${s.wood} are available.`);
  $("boards").disabled = s.wood < 2;
  $("log").replaceChildren(
    ...eventHistory(s).map((event) => {
      const li = document.createElement("li");
      const time = document.createElement("small");
      time.textContent = `${eventTime(event.time)}${event.count > 1 ? ` · ×${event.count}` : ""}`;
      li.append(time, document.createTextNode(event.text));
      return li;
    }),
  );
  for (const key of Object.keys(PROJECTS)) {
    const b = $(`build-${key}`);
    if(!b)continue;
    disabledReason(b, "This project is already planned or built. Select the existing project to manage it.");
    b.disabled =
      s.mode !== "sandbox" &&
      !PROJECTS[key].repeatable &&
      s.projects.some((p) => p.key === key);
    const missing = missingMaterials(s, key);
    buildMaterialTooltip.update(b,missing);
    const purchase = blueprintPurchase(s, key);
    b.title = `${["coop","goat_pasture"].includes(key) ? "Animals require daily fodder and drinking water; purchase feed before they arrive. " : ""}${PROJECTS[key].description} ${constructionSpecText(PROJECTS[key])} Materials: ${recipeText(key)}. ${missing.length ? purchase.error || `Auto-buy missing materials: R$${purchase.cost.toFixed(2)}. Collection reserve: R$${purchase.transport.toFixed(2)} across outstanding orders.` : "All materials available."}`;
    b.querySelector(".build-cost").textContent = s.mode === "sandbox" ? "Free"
      : s.autoBuy===false && missing.length ? 'Missing materials'
      : purchase.cost ? `R$${purchase.cost.toFixed(2)} + R$${(purchase.transport || 0).toFixed(2)} collection reserve`
      : `${Object.values(PROJECTS[key].materials).reduce((sum, n) => sum + n, 0)} materials · ${PROJECTS[key].size.join("×")}`;
    b.classList.toggle("active", placing === key);
    b.classList.toggle("needs-materials", missing.length > 0);
  }
  renderUtilityUI();
  management?.render();
  const p = s.projects.find((p) => p.id === selected);
  $("selection").hidden = !p || s.stage === "evening";
  if (p) {
    $("selected-name").textContent = projectLabel(p, PROJECTS);
    $("move").hidden=!!PROJECTS[p.key].natural;
    for(const mode of ["salvage","demolish"]){$(mode+"-building").hidden=!!PROJECTS[p.key].natural;$(mode+"-building").disabled=!!p.removal;}
    $("copy-building").hidden = PROJECTS[p.key].natural ||
      s.mode !== "sandbox" && !PROJECTS[p.key].repeatable;
    illustrate($("selected-art"), PROJECTS[p.key].asset);
    const construction = constructionProgress(s, p, PROJECTS[p.key], requiredLoads(p));
    $("selected-state").textContent = p.removal ? `${p.removal.status} · ${Math.floor(p.removal.work/p.removal.required*100)}%` : p.work < PROJECTS[p.key].work ? construction.phase : operationalStatus(p, s.infrastructure?.nodes[p.id], productionActivity(s,p,PROCESSES));
    $("selected-benefit").textContent = buildingBenefit(PROJECTS[p.key], PROCESSES, COMMUNITY);
    $("selected-benefit").hidden = !$("selected-benefit").textContent;
    $("construction-summary").hidden = p.work >= PROJECTS[p.key].work;
    $("construction-detail").textContent = construction.detail;
    $("construction-workers").textContent = construction.workers;
    $("construction-progress").value = construction.value;
    $("construction-progress").setAttribute('aria-label', construction.phase);
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
      `${projectDescription(PROJECTS[p.key], p)} ${constructionSpecText(PROJECTS[p.key])}${p.work >= PROJECTS[p.key].work ? livestock : ""} ${p.pendingMaterials ? "Purchased materials awaiting pickup." : "Materials reserved."} Reserved bill: ${Object.entries(p.billOfMaterials||PROJECTS[p.key].materials).map(([id,n])=>materialText(id,n)).join(" · ")}. Delivered ${p.delivered}/${requiredLoads(p)} loads. Labor ${Math.round(p.work * 0.45)}/${Math.round(PROJECTS[p.key].work * 0.45)} person-minutes.`;
    disabledReason($("priority"), "Construction is complete; this building no longer needs construction priority.");
    $("priority").disabled = p.work >= PROJECTS[p.key].work;
    $("cancel-project").hidden = !!PROJECTS[p.key].natural || p.work > 0;
    const cancelError = cancelProjectError(s, p.id);
    $("cancel-project").disabled = !!cancelError;
    $("cancel-project").title = cancelError || 'Remove this unstarted plan and return reserved supplies.';
    $("cancel-project-note").textContent = p.work === 0 && !PROJECTS[p.key].natural ? cancelError : '';
    $("cancel-project-note").hidden = !$("cancel-project-note").textContent;
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
  build: (key) => { setPanel(null); document.querySelector(".view-menu").open = false; startPlacement(key); },
  beforeOpen: () => { if (placing) cancel(); },
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
    if(p?.cultivation)farmingUI.open();
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
$("tank-attention").onclick = () => management.open("water");
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
    accumulator = simulationFrame(accumulator, dt, speed, step => {
      previousMotion = captureMotion(s);
      tick(s, step);
    });
  }
  wildlife.update(!paused && !document.hidden ? dt : 0);
  capybaras.update(!paused && !document.hidden ? dt : 0);
  const visual = interpolateMotion(previousMotion, s, accumulator / 0.1);
  const arrivalTime=Math.max(0,s.arrivalElapsed-(paused?0:0.1)+accumulator);
  drawCamp();
  syncBuildings();
  if (!placing) entranceMarker.visible = false;
  const selectedModel = buildings.get(selected)?.root;
  const fieldEdge=selectedModel?.userData.cultivatedField?selectedModel.getObjectByName('field-boundary'):null;
  if(fieldEdge!==selectedFieldEdge){if(selectedFieldEdge){selectedFieldEdge.material.color.set('#b5a16c');selectedFieldEdge.material.opacity=.65;}if(fieldEdge){fieldEdge.material.color.set('#3b6545');fieldEdge.material.opacity=1;}selectedFieldEdge=fieldEdge;}
  selectionOutline.visible = !!selectedModel && !placing && !fieldEdge;
  if (selectionOutline.visible) { selectedModel.updateWorldMatrix(true, true); selectionOutline.setFromObject(selectedModel); }
  if (!paused && !document.hidden) animalTime += dt * speed;
  for (const [id, entry] of buildings)
    if (entry.animals.length)
      animateAnimals(entry.animals, animalTime + id * 2.73);
  for (const [id, entry] of buildings)
    if (entry.fire) animateFire(entry.fire, animalTime + id * 2.73);
  entrance.position.copy(world(s.stock.x, s.stock.z));
  for (const [index, vehicle] of vehicles.entries()) {
      const current=activeTrips(s).find(t=>t.vehicle===index);
      const trip=current&&{...current,left:current.left+(s.time-visual.time)};
      const pose = s.arrivalAnimating ? {...vehiclePose(arrivalTime,index),visible:true} : townCarPose(trip, index);
      vehicle.root.visible = pose.visible;
      vehicle.root.position.set(pose.x, elevationAt(pose.x, pose.z, s.elevationSeed, s.terrainPads), pose.z);
      const forwardX = Math.sin(pose.yaw), forwardZ = Math.cos(pose.yaw);
      const height = (right, forward) => elevationAt(
        pose.x + Math.cos(pose.yaw) * right + forwardX * forward,
        pose.z - Math.sin(pose.yaw) * right + forwardZ * forward,
        s.elevationSeed, s.terrainPads);
      vehicle.root.rotation.set(
        -Math.atan2(height(0, 1.4) - height(0, -1.4), 2.8),
        pose.yaw,
        Math.atan2(height(.8, 0) - height(-.8, 0), 1.6),
        "YXZ");
      for (const wheel of vehicle.wheels) {
        wheel.rotation.set(0, 0, Math.PI / 2);
        wheel.rotateY((pose.z + 22) / 0.41);
      }
    }
  for (const [i, r] of s.people.entries()) {
    const g = actors[i];
    if(s.arrivalAnimating){
      const pose=arrivalPose(arrivalTime,i);
      g.visible=pose.visible;g.position.set(pose.x,pose.y+elevationAt(pose.x,pose.z,s.elevationSeed,s.terrainPads),pose.z);g.rotation.y=pose.yaw;
      animateResident(g.rig,pose.walking?'walk':'idle',arrivalTime+i*.7,paused?0:dt*speed);
      continue;
    }
    g.visible = r.outsideWork?.phase!=='away' &&
      (r.action !== "town" ||
        ["boarding", "unloading"].includes(activeTrips(s).find(t=>t.person===r.id)?.phase)) &&
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
    const leisureFacing=downtimeMotion(r)?r.downtime.facing:r.needTask?.elapsed>0&&!r.walk.length?r.needTask.facing:null;
    if(leisureFacing)desiredYaw=Math.atan2(leisureFacing.x-r.x,leisureFacing.z-r.z);
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
      production && (production.gathering ||
      [
        "garden",
        "greenhouse",
        "orchard",
        "grove",
        "coop",
        "goat_pasture",
        "compost",
        "apiary",
      ].includes(production.kind));
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
        ? (visit.private ? "duck-walk" : conversationMotion(r) || visit.animation)
      : downtimeMotion(r)
        ? downtimeMotion(r)
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
  foliageWind.update(!paused && !document.hidden ? dt : 0);
  riverTime+=!paused && !document.hidden ? dt : 0;
  river.update(riverTime);
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
  const shadowExtent = Math.max(16, Math.hypot(camera.right - camera.left, camera.top - camera.bottom) / (2 * camera.zoom) + 12);
  sun.position.sub(sun.target.position).normalize().multiplyScalar(400);
  sun.target.position.copy(controls.target);
  sun.position.add(sun.target.position);
  Object.assign(sun.shadow.camera, { left: -shadowExtent, right: shadowExtent,
    top: shadowExtent, bottom: -shadowExtent, near: 1, far: 900 });
  sun.shadow.camera.updateProjectionMatrix();
  drawUtilities();
  utilityLines.visible = !lenses.active;
  lenses.update(now);
  accessPreview.visible=!!placing&&(ghost.visible||!!wireframe?.visible);
  renderer.render(scene, camera);
  recordPerformance(now, visual.time);
  requestAnimationFrame(frame);
}
const lenses = installLenses({state:()=>s,camera,world,focus,inspect:id=>{setPanel(null);selected=id;renderUI();}});
addEventListener("pagehide", persist);
requestAnimationFrame(frame);

installAudio();

installDisabledInfo();
