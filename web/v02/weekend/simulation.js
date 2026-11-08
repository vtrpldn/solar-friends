import { STORAGE_KINDS, crewLimit, carriedLoads } from "./construction-logistics.js";
import {registerWorld,validSettings,townDuration,waterFactor} from './world-settings.js';
import {depositCapacity} from './land-layout.js';
import {workMultiplier} from './resident-personality.js';
import { ensureNeeds, decayNeeds, chooseNeed, advanceNeed, validNeeds } from "./resident-needs.js";
import { validTerrainVertices } from "./terraform.js";
import { ROAD_SHIFT } from "./road-layout.js";
import { roadLine } from "./placement-helpers.js";
import { autoConnectUtilities } from "./auto-utilities.js";
import { PathQueue } from "./path-queue.js";
import { carDoor, TRIP_DURATION, DRIVE_DURATION } from "./town-trip.js";
import { CELL_MIN, CELL_MAX } from "./map-size.js";
import { foundationPad } from "./elevation.js";
import { OPENING_PROJECTS, openingProgress } from "./opening.js";
import { COMMUNITY } from "../library/community-defs.js";
import {
  ensureInfrastructure,
  syncInfrastructure,
  infrastructureStep,
  connect,
  useWater,
  LIQUIDS,
  validInfrastructure,
} from "./infrastructure.js";
import { expandMaterials, expandProjects, PROCESSES } from "./catalog-rules.js";
import { accessRoadAt } from "./road-layout.js";
import { ARRIVAL_DURATION, ARRIVAL_SPOTS } from "./arrival.js";
import { riverBankAt, riverAccess, riverCenter } from "./river-layout.js";
// A self-contained v2 prototype. Time is measured in active simulation seconds.
export const CAMPS = [
  {
    id: "shade",
    name: "Under the trees",
    x: 28,
    z: 31,
    shade: true,
    wet: false,
    description: "Cool afternoons, but a longer walk from the unloading point.",
  },
  {
    id: "entrance",
    name: "Beside the entrance",
    x: 33,
    z: 27 - ROAD_SHIFT / 2,
    shade: false,
    wet: false,
    description: "Quick unloading beside the entrance clearing.",
  },
  {
    id: "clearing",
    name: "The open clearing",
    x: 36,
    z: 36,
    shade: false,
    wet: false,
    description: "Dry, roomy ground. You’ll need to make your own shade.",
  },
];
export const MATERIALS = {
  wood: { name: "timber pieces", batch: 4, quantity: 12, price: 45 },
  hardware: { name: "fastener packs", batch: 1, quantity: 2, price: 30 },
  roofing: { name: "roof sheets", batch: 2, quantity: 6, price: 120 },
  tarp: { name: "tarp & rope kits", batch: 1, quantity: 1, price: 50 },
  tank: { name: "water tanks", batch: 1, quantity: 1, price: 140 },
  plumbing: { name: "pipe & tap kits", batch: 1, quantity: 1, price: 40 },
  sanitation: { name: "toilet kits", batch: 1, quantity: 1, price: 80 },
};
export const PROJECTS = {
  gathering: {
    name: "Gathering place",
    asset: "picnic-table",
    size: [2, 2],
    materials: {
      wood: 8,
      hardware: 1,
    },
    work: 134,
    description:
      "Assemble a table and benches from pre-cut boards. About 1 person-hour of assembly, plus carrying.",
  },
  water: {
    name: "Water storage",
    asset: "well",
    size: [2, 2],
    materials: { wood: 8, hardware: 1, tank: 1, plumbing: 1 },
    work: 267,
    description:
      "An unpowered tank holding 40 clean water. Receives treated water or resident deliveries; it does not collect rain or filter river water. About 2 person-hours to assemble.",
  },
  shelter: {
    name: "Basic shelter",
    asset: "shed",
    size: [2, 2],
    materials: { wood: 24, hardware: 3, roofing: 6 },
    work: 1067,
    description:
      "Raise a small open timber shelter with a sheet roof. About 8 person-hours with pre-cut timber, plus carrying. The frame gives shade halfway through.",
  },
  toilet: {
    name: "Private toilet",
    asset: "eco_toilet",
    size: [2, 2],
    materials: { wood: 16, hardware: 2, roofing: 2, sanitation: 1 },
    work: 534,
    description:
      "Assemble a temporary screened toilet around a purchased dry-toilet kit. About 4 person-hours, plus carrying; permanent sanitation comes later.",
  },
};
expandMaterials(MATERIALS);
expandProjects(PROJECTS);
Object.assign(PROJECTS, OPENING_PROJECTS);
export { PROCESSES };
export function footprint(p) {
  const [w, d] = PROJECTS[p.key].size;
  return (p.rotation || 0) % 2 ? [d, w] : [w, d];
}
function shelteredFrontCell(p, x, z) {
  const [w, d] = footprint(p);
  return [z === p.z + d - 1, x === p.x + w - 1, z === p.z, x === p.x][
    p.rotation || 0
  ];
}
export function buildingFront(p) {
  const [w, d] = footprint(p),
    angle = ((p.rotation || 0) * Math.PI) / 2;
  const reach = (PROJECTS[p.key].size[1] + 1) / 2;
  return {
    x: p.x + (w - 1) / 2 + Math.sin(angle) * reach,
    z: p.z + (d - 1) / 2 + Math.cos(angle) * reach,
  };
}
export function crossingAt(s, x, z) {
  return s.projects.find(
    (p) =>
      p.key === "bridge" && p.work >= PROJECTS[p.key].work && covers(p, x, z),
  );
}
function covers(p, x, z) {
  const [w, d] = footprint(p);
  return (
    x >= p.x - 0.5 && x <= p.x + w - 0.5 && z >= p.z - 0.5 && z <= p.z + d - 0.5
  );
}
function roadAt(s, x, z) {
  return (
    accessRoadAt(x, z) ||
    s.projects.some(
      (p) =>
        ["road", "bridge"].includes(p.key) &&
        p.work >= PROJECTS[p.key].work &&
        covers(p, x, z),
    )
  );
}
export function bridgeDeckHeight(p, x, z) {
  const [w, d] = footprint(p),
    along =
      (p.rotation || 0) % 2 ? z - (p.z + (d - 1) / 2) : x - (p.x + (w - 1) / 2);
  return 0.08 + 0.42 * Math.min(1, Math.max(0, (8 - Math.abs(along * 2)) / 2));
}
function bridgeEnds(p) {
  const [w, d] = footprint(p);
  return (p.rotation || 0) % 2
    ? [
        { x: p.x + (w - 1) / 2, z: p.z - 1 },
        { x: p.x + (w - 1) / 2, z: p.z + d },
      ]
    : [
        { x: p.x - 1, z: p.z + (d - 1) / 2 },
        { x: p.x + w, z: p.z + (d - 1) / 2 },
      ];
}
export function storageCapacity(s) {
  if (s.mode === "sandbox") return 1000000;
  return (
    600 +
    s.projects.filter(
      (p) =>
        ["warehouse", "covered-storage"].includes(PROJECTS[p.key].kind) &&
        p.work >= PROJECTS[p.key].work,
    ).length *
      600
  );
}
export function storedMaterials(s) {
  return s.wood + Object.values(s.materials).reduce((a, b) => a + b, 0);
}
function changeMaterial(s, id, n) {
  if (id === "wood") s.wood += n;
  else s.materials[id] += n;
}
export function sellMaterial(s, id) {
  const item = MATERIALS[id];
  if (
    !item ||
    !item.quantity ||
    s.stage !== "playing" ||
    materialCount(s, id) < item.quantity
  )
    return false;
  changeMaterial(s, id, -item.quantity);
  s.money += Math.floor(item.price * 0.5);
  return true;
}
function wakeHelpers(s) {
  for (const r of s.people)
    if (
      !r.job &&
      !r.tentPhase &&
      [
        "idle",
        "look",
        "stretch",
        "chat",
        "stroll",
        "breathe",
        "relax",
      ].includes(r.action)
    ) {
      r.walk = [];
      r.target = null;
      r.idleUntil = 0;
      r.idleGoal = null;
    }
}
export function connectUtility(s, kind, from, to) {
  if (s.stage !== "playing") return "Choose a camp first.";
  const error = connect(s, PROJECTS, kind, Number(from), Number(to));
  if (!error) wakeHelpers(s);
  return error;
}
export function queueProduction(s, site, recipe) {
  const p = s.projects.find((p) => p.id === Number(site)),
    def = PROCESSES[recipe];
  if (
    !p ||
    !def ||
    p.work < PROJECTS[p.key].work ||
    PROJECTS[p.key].kind !== def.kind
  )
    return "Choose a completed compatible building.";
  s.operations ??= [];
  if (s.operations.length > 128)
    s.operations = [
      ...s.operations.filter((o) => !o.done),
      ...s.operations.filter((o) => o.done).slice(-32),
    ];
  if (s.operations.some((o) => o.site === p.id && !o.done))
    return "This site already has a job.";
  if ((p.readyAt || 0) > s.time)
    return `Growing: ready in ${Math.ceil(p.readyAt - s.time)} seconds.`;
  if (def.deposit && (p.extracted || 0) >= depositCapacity(s.landSeed,p,def))
    return "This deposit is exhausted.";
  for (const [id, n] of Object.entries(def.input))
    if (materialCount(s, id) < n) return `Missing ${n} ${id}.`;
  if (p.key === "goat-pasture-empty" && !p.stocked) {
    if (materialCount(s, "goats") < 2)
      return "Bring 2 goats to stock this pasture.";
    changeMaterial(s, "goats", -2);
    p.stocked = true;
  }
  for (const [id, n] of Object.entries(def.input)) changeMaterial(s, id, -n);
  s.operations.push({
    id: (s.nextOperation = (s.nextOperation || 0) + 1),
    site: p.id,
    recipe,
    work: 0,
    phase: "pickup",
    done: false,
  });
  wakeHelpers(s);
  return "";
}
export function repeatProduction(s, site, recipe) {
  const p = s.projects.find((p) => p.id === Number(site));
  if (
    !p ||
    !PROCESSES[recipe] ||
    PROJECTS[p.key].kind !== PROCESSES[recipe].kind
  )
    return false;
  p.repeat = p.repeat === recipe ? null : recipe;
  return true;
}
export function queueWater(s, from, to, kind = "fresh") {
  const sys = syncInfrastructure(s, PROJECTS);
  from = Number(from);
  to = Number(to);
  if (
    !LIQUIDS.includes(kind) ||
    !sys.nodes[to] ||
    (from !== -1 && !sys.nodes[from]) ||
    from === to
  )
    return "Choose valid water endpoints.";
  if (from === -1 && kind !== "irrigation")
    return "River water is irrigation water; filter it before drinking.";
  const i = LIQUIDS.indexOf(kind),
    target = sys.nodes[to];
  if (!target.capacity[i])
    return "The destination cannot store that water class.";
  if (target.capacity[i] - target.water[i] < 0.1) return "Destination is full.";
  if (from !== -1 && sys.nodes[from].water[i] < 0.1) return "Source is empty.";
  s.operations ??= [];
  if (s.operations.some((o) => !o.done && o.water && o.water.to === to))
    return "A water delivery is already queued here.";
  s.operations.push({
    id: (s.nextOperation = (s.nextOperation || 0) + 1),
    site: to,
    water: { from, to, kind, amount: 0 },
    work: 0,
    phase: "pickup",
    done: false,
  });
  wakeHelpers(s);
  return "";
}
function utilitySpot(s, node, r) {
  if (node.id === -1) return { x: node.x, z: node.z };
  const p = s.projects.find((p) => p.id === node.id);
  if (
    p &&
    ["workshop", "kitchen", "wash-station", "eco_toilet", "home"].includes(
      PROJECTS[p.key].kind,
    )
  ) {
    const front = buildingFront(p);
    if (
      !occupied(s, front.x, front.z) &&
      !s.people.some(
        (other) =>
          other !== r &&
          (Math.hypot(other.x - front.x, other.z - front.z) < 0.55 ||
            (other.target?.x === front.x && other.target?.z === front.z)),
      ) &&
      route(s, r, front)
    )
      return front;
  }
  return p ? workSpot(s, r, p) : { x: s.stock.x - 1, z: s.stock.z + 1 };
}
function operationalWork(s, r, i, dt) {
  const sys = ensureInfrastructure(s);
  const reserved = (op) =>
    s.people.some(
      (other) =>
        other !== r &&
        other.operation === op.id &&
        !["rest", "town"].includes(other.action),
    );
  const eligible = (op) => {
    if (op.done || reserved(op)) return false;
    if (op.water || op.phase === "return") return true;
    const node = sys.nodes[op.site],
      recipe = PROCESSES[op.recipe];
    if (!node?.enabled) {
      op.status = "Building switched off";
      return false;
    }
    if (
      ["workshop", "kitchen"].includes(recipe.kind) &&
      node.power < 0.99 &&
      !(recipe.kind === "kitchen" && (op.biogas || sys.biogas >= 0.2))
    ) {
      op.status = "Waiting for power";
      return false;
    }
    if (
      recipe.water &&
      !op.waterPaid &&
      Math.max(
        node.water[0],
        ["kitchen", "goat_pasture", "coop"].includes(recipe.kind)
          ? 0
          : node.water[1],
      ) < recipe.water
    ) {
      op.status = "Waiting for usable water";
      return false;
    }
    return true;
  };
  let op = (s.operations || []).find(
    (o) => o.id === r.operation && eligible(o),
  );
  if (!op) op = (s.operations || []).find(eligible);
  if (
    sys.links.some(
      (l) =>
        l.work < l.required &&
        !s.people.some(
          (other) =>
            other !== r &&
            other.linkJob === l.id &&
            !["rest", "town"].includes(other.action),
        ),
    )
  ) {
    op = null;
    r.operation = null;
  }

  if (!op) {
    const link = sys.links.find(
      (l) =>
        l.work < l.required &&
        !s.people.some(
          (other) =>
            other !== r &&
            other.linkJob === l.id &&
            !["rest", "town"].includes(other.action),
        ),
    );
    if (!link) {
      r.operation = null;
      r.linkJob = null;
      return false;
    }
    r.linkJob = link.id;
    const dest = utilitySpot(s, sys.nodes[link.from], r);
    if (!dest) return false;
    r.action = "install";
    if (go(s, r, dest)) {
      link.work = Math.min(link.required, link.work + dt);
      r.work += dt;
      r.energy = Math.max(0, r.energy - dt * 0.1);
    }
    return true;
  }
  r.linkJob = null;
  r.operation = op.id;
  const node = sys.nodes[op.site],
    p = s.projects.find((p) => p.id === op.site);
  if (!node) {
    op.done = true;
    return false;
  }
  if (op.water) {
    const w = op.water,
      index = LIQUIDS.indexOf(w.kind);
    if (op.phase === "pickup") {
      let start;
      if (w.from === -1) {
        start = riverAccess(s.landSeed);
      } else start = utilitySpot(s, sys.nodes[w.from], r);
      if (!start) return false;
      r.action = "fetch-water";
      if (!go(s, r, start)) return true;
      const dest = sys.nodes[w.to];
      w.amount = Math.min(
        12,
        dest.capacity[index] - dest.water[index],
        w.from === -1 ? 12 : sys.nodes[w.from].water[index],
      );
      if (w.from === -1) sys.account.waterReceived += w.amount;
      else sys.nodes[w.from].water[index] -= w.amount;
      op.phase = "deliver";
      r.target = null;
    }
    r.action = "carry";
    r.cargo = true;
    const dest = utilitySpot(s, node, r);
    if (!dest || !go(s, r, dest)) return true;
    const n = Math.min(w.amount, node.capacity[index] - node.water[index]);
    node.water[index] += n;
    w.amount -= n;
    if (w.amount > 0.00001) {
      op.status = "Destination full; water remains in the sealed carrier.";
      return true;
    }
    r.cargo = false;
    op.done = true;
    r.operation = null;
    return true;
  }
  const recipe = PROCESSES[op.recipe];
  if (op.phase === "return") {
    r.action = "carry";
    r.cargo = true;
    op.status = "Carrying output to storage";
    if (!go(s, r, supplySpot(s, r, i))) return true;
    const total = Object.values(recipe.output).reduce((a, b) => a + b, 0);
    if (storedMaterials(s) + total > storageCapacity(s)) {
      op.status = "Storage full; output is still carried";
      return true;
    }
    for (const [id, n] of Object.entries(recipe.output))
      changeMaterial(s, id, n);
    op.done = true;
    r.operation = null;
    r.cargo = false;
    say(s, `${recipe.name}: supplies delivered to storage.`);
    return true;
  }

  if (op.phase === "pickup") {
    r.action = "collect";
    if (!go(s, r, supplySpot(s, r, i))) return true;
    op.phase = "process";
    r.target = null;
  }
  r.action = "carry";
  r.cargo = true;
  const dest = utilitySpot(s, node, r);
  if (!dest || !go(s, r, dest)) return true;
  r.cargo = false;
  if (!node.enabled) {
    op.status = "Building switched off";
    r.action = "blocked";
    return true;
  }
  if (recipe.water && !op.waterPaid) {
    if (
      !useWater(
        s,
        p.id,
        recipe.water,
        !["kitchen", "goat_pasture", "coop"].includes(recipe.kind),
      )
    ) {
      op.status = "Waiting for usable water";
      r.action = "blocked";
      return true;
    }
    op.waterPaid = true;
  }
  if (
    recipe.kind === "kitchen" &&
    node.power < 0.99 &&
    !op.biogas &&
    sys.biogas >= 0.2
  ) {
    sys.biogas -= 0.2;
    op.biogas = true;
  }
  if (
    ["workshop", "kitchen"].includes(recipe.kind) &&
    node.power < 0.99 &&
    !op.biogas
  ) {
    op.status = "Waiting for power";
    r.action = "blocked";
    return true;
  }
  const output = Object.values(recipe.output).reduce((a, b) => a + b, 0);
  if (storedMaterials(s) + output > storageCapacity(s)) {
    op.status = "Storage full";
    r.action = "blocked";
    return true;
  }
  op.status = "Working";
  if (r.energy < 25) { r.action = "idle"; r.operation = null; return true; }
  r.action = "produce";
  op.work += dt * workMultiplier(r,p.key) * (node.power > 0.99 && recipe.kind === "workshop" ? 2 : 1);
  r.work += dt;
  r.energy = Math.max(0, r.energy - dt * 0.12);
  if (op.work >= recipe.work) {
    op.phase = "return";
    r.target = null;
    p.readyAt = s.time + (recipe.renew || 0);
    p.extracted = (p.extracted || 0) + output;
    op.work = recipe.work;
  }
  return true;
}
export function materialText(id, n) {
  return `${n} ${n === 1 ? MATERIALS[id].name.replace(/ies$/, "y").replace(/s$/, "") : MATERIALS[id].name}`;
}
export function recipeText(key) {
  return Object.entries(PROJECTS[key].materials)
    .map(([id, n]) => materialText(id, n))
    .join(" · ");
}
export function materialCount(s, id) {
  return id === "wood" ? s.wood : s.materials[id];
}
export function missingMaterials(s, key) {
  if (s.mode === "sandbox") return [];
  return Object.entries(PROJECTS[key].materials)
    .filter(([id, n]) => materialCount(s, id) < n)
    .map(([id, n]) => materialText(id, n - materialCount(s, id)));
}
export function blueprintPurchase(s, key, count = 1) {
  const items = {};
  let cost = 0;
  if (s.mode !== "sandbox") for (const [id, required] of Object.entries(PROJECTS[key].materials)) {
    const missing = Math.max(0, required * count - materialCount(s, id));
    if (!missing) continue;
    if(s.autoBuy===false)return {items:{},cost:0,error:'Auto-buy is off. Gather or purchase the missing materials first.'};
    const item = MATERIALS[id];
    if (!item.quantity || !Number.isFinite(item.price)) return {items, cost: 0, error: `Produce ${item.name} locally first.`};
    items[id] = missing;
    cost += missing * item.price / item.quantity;
  }
  cost = Math.ceil(cost * 100) / 100;
  return {items, cost, error: cost > s.money ? `Missing materials cost R$${cost.toFixed(2)}; shared savings are too low.` : ""};
}
function dispatchBlueprintPickup(s) {
  const pending = s.projects.filter(p => p.pendingMaterials);
  if (!pending.length) return;
  // The order stays editable until the driver actually leaves the village.
  if (s.trip) {
    if (s.trip.project && s.trip.phase === "boarding") s.trip.projects = pending.map(p=>p.id);
    return;
  }
  if (supplyRun(s, Object.keys(pending[0].pendingMaterials)[0], pending[0]))
    s.trip.projects = pending.map(p=>p.id);
}
export function requiredLoads(key) {
  return Object.entries(PROJECTS[key].materials).reduce(
    (sum, [id, n]) => sum + Math.ceil(n / MATERIALS[id].batch),
    0,
  );
}
export const NAMES = ["Iara", "Bento", "Luz", "Cauã", "Nina"];
export function beginArrival(s) {
  s.arrivalAnimating=true;
  s.arrivalElapsed=0;
  return s;
}
export function createWeekend(landSeed = 0) {
  return {
    version: 2,
    landSeed,
    elevationSeed: landSeed,
    terrainPads: [],
    livestockUnits: 1,
    opening: { version: 1, townTrips: 0 },
    stage: "arrival",
    arrivalElapsed: ARRIVAL_DURATION,
    camp: null,
    time: 0,
    money: 220,
    wood: 36,
    materials: {
      ...Object.fromEntries(
        Object.keys(MATERIALS)
          .filter((k) => k !== "wood")
          .map((k) => [k, 0]),
      ),
      tools: 4,
      meals: 20,
      food: 12,
      hardware: 7,
      roofing: 8,
      tarp: 1,
      tank: 1,
      plumbing: 1,
      sanitation: 1,
    },
    stock: { x: 32, z: 23 - ROAD_SHIFT / 2 },
    projects: [],
    people: NAMES.map((name, i) => ({
      name,
      id: ["iara", "bento", "luz", "caua", "nina"][i],
      x: ARRIVAL_SPOTS[i][0],
      z: ARRIVAL_SPOTS[i][1],
      energy: 85 + i * 3,
      needs: ensureNeeds({},i),
      action: "idle",
      job: null,
      cargo: false,
      target: null,
      walk: [],
      work: 0,
    })),
    trip: null,
    rain: false,
    rainSeen: false,
    rainResolved: false,
    meal: false,
    log: [
      "Five friends, one plot of land. Let’s make somewhere we can stay together.",
    ],
    nextId: 1,
  };
}
export function createSandbox(landSeed = 0) {
  const s = createWeekend(landSeed);
  delete s.opening;
  s.mode = "sandbox";
  s.instantBuild = true;
  s.arrivalElapsed = ARRIVAL_DURATION;
  chooseCamp(s, "clearing");
  sandboxSupplies(s);
  s.log = [
    "Your land, your pace. All buildings are available; construction is free. Toggle Instant build to let residents do the work.",
  ];
  return s;
}
function sandboxSupplies(s) {
  s.money = 999999;
  s.wood = 9999;
  for (const id of Object.keys(MATERIALS))
    if (id !== "wood") s.materials[id] = 9999;
}
export function say(s, text) {
  s.log.unshift(text);
  s.log = s.log.slice(0, 12);
}
export function campLocation(s) {
  return s.camp === "custom" ? s.campSite : CAMPS.find((c) => c.id === s.camp);
}
export function campPlacementError(s, x, z) {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(z) ||
    x < CELL_MIN + 4 ||
    z < CELL_MIN + 6 ||
    x > CELL_MAX - 6 ||
    z > CELL_MAX - 5
  )
    return "Keep the tents inside the plot.";
  if (
    !foundationPad(x - 1, z - 3, 5, 4, s.elevationSeed, s.terrainPads)
  )
    return "Leave space between foundations at different heights.";
  for (let cx = x - 1; cx <= x + 3; cx++)
    for (let cz = z - 3; cz <= z; cz++) {
      if (riverBankAt(cx, cz, 2, s.landSeed))
        return "Keep the tents back from the river.";
      if (
        accessRoadAt(cx, cz, 1) ||
        blockedCamp({ ...s, camp: null }).some((p) => p.x === cx && p.z === cz)
      )
        return "Leave the road, trees and supplies clear.";
    }
  if (!route({ ...s, camp: null }, s.stock, { x, z: z + 1 }))
    return "Choose somewhere reachable from the supplies.";
  return null;
}
export function chooseCamp(s, id) {
  if (s.stage !== "arrival" || s.arrivalElapsed < ARRIVAL_DURATION)
    return false;
  const custom = typeof id === "object" && id !== null;
  if (custom && campPlacementError(s, id.x, id.z)) return false;
  const c = custom
    ? {
        id: "custom",
        name: "Your camp",
        x: id.x,
        z: id.z,
        shade: false,
        wet: false,
      }
    : CAMPS.find((c) => c.id === id);
  if (!c) return false;
  if (custom) s.campSite = c;
  s.camp = c.id;
  const campPad = foundationPad(
    c.x - 1,
    c.z - 3,
    5,
    4,
    s.elevationSeed,
    s.terrainPads,
  );
  if (campPad) (s.terrainPads ??= []).push(campPad);
  // Unpacking tents is an instantaneous setup step; keep the group beside them.
  for (const r of s.people) {
    if (walkSegmentClear(s, r, r)) continue;
    const spots = [];
    for (let x = 20; x <= 45; x++)
      for (let z = 20; z <= 45; z++) {
        const p = { x, z };
        if (
          walkSegmentClear(s, p, p) &&
          s.people.every((o) => o === r || Math.hypot(o.x - x, o.z - z) > 0.7)
        )
          spots.push(p);
      }
    spots.sort(
      (a, b) =>
        Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z),
    );
    if (spots[0]) Object.assign(r, spots[0]);
  }
  s.stage = "playing";
  if (s.opening)
    say(
      s,
      "Iara: We have tents, meals and drinking water. There’s a spare tarp in the supplies if the weather turns.",
    );
  say(s, `${c.name}: unpack first, then choose what matters most.`);
  return true;
}
export function finished(s, key) {
  return s.projects.some((p) => p.key === key && p.work >= PROJECTS[key].work);
}
export function placementError(s, key, x, z, ignore = null, rotation = 0) {
  const def = PROJECTS[key];
  if (!def || !Number.isInteger(x) || !Number.isInteger(z))
    return "Choose a grid square.";
  if (!Number.isInteger(rotation) || rotation < 0 || rotation > 3)
    return "Choose a valid orientation.";
  const [w, d] = footprint({ key, rotation });
  if (
    !["road", "bridge"].includes(key) &&
    !foundationPad(x, z, w, d, s.elevationSeed, s.terrainPads)
  )
    return "Leave a little space between foundations at different heights.";
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++)
      if (key !== "road" && accessRoadAt(x + dx, z + dz, 1))
        return "Keep the access road and parking clearing open.";
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++)
      if (
        !["hydro", "bridge", "water-pump"].includes(def.kind) &&
        riverBankAt(x + dx, z + dz, 1, s.landSeed)
      )
        return "Keep projects back from the riverbank.";
  if (
    x < CELL_MIN + 2 ||
    z < CELL_MIN + 2 ||
    x + w > CELL_MAX - 2 ||
    z + d > CELL_MAX - 2
  )
    return "Keep buildings inside the plot boundary.";
  if(def.kind==='water-pump' && !riverBankAt(x+.5,z+.5,3,s.landSeed) &&
    !s.projects.some(p=>PROJECTS[p.key].kind==='groundwater-well'&&p.work>=PROJECTS[p.key].work&&Math.hypot(p.x-x,p.z-z)<=6))
    return 'Place the pump beside the river or within 6 cells of a completed water well.';
  if (def.kind === "hydro" && !riverBankAt(x + w / 2, z + d / 2, 3, s.landSeed))
    return "Place the river generator beside the river.";
  if (key === "bridge") {
    const ends = bridgeEnds({ key, x, z, rotation });
    if (
      !riverBankAt(x + (w - 1) / 2, z + (d - 1) / 2, 0, s.landSeed) ||
      ends.some((e) => riverBankAt(e.x, e.z, 0.7, s.landSeed))
    )
      return "Span the river with both bridge ends on dry land.";
    if (!ends.some((e) => route(s, s.stock, e)))
      return "Keep one bridge end reachable from the village.";
  }
  if (
    x <= s.stock.x &&
    x + w > s.stock.x &&
    z <= s.stock.z &&
    z + d > s.stock.z
  )
    return "Leave the supplies accessible.";
  if (
    s.projects.some(
      (p) =>
        p.id !== ignore &&
        x < p.x + footprint(p)[0] &&
        x + w > p.x &&
        z < p.z + footprint(p)[1] &&
        z + d > p.z,
    )
  )
    return "Another project occupies that space.";
  if (
    blockedCamp(s).some(
      (c) => c.x >= x && c.x < x + w && c.z >= z && c.z < z + d,
    )
  )
    return "Leave the tents, trees and arrival area clear.";
  const proposed = {
    ...s,
    projects: [
      ...s.projects.filter((p) => p.id !== ignore),
      { id: ignore || -1, key, x, z, rotation },
    ],
  };
  for (const p of proposed.projects.filter(
    (p) => !["road", "bridge"].includes(p.key),
  ))
    for (const dz of [0, 1])
      if (
        !route(proposed, s.stock, {
          x: PROJECTS[p.key].kind === "hydro" ? p.x + footprint(p)[0] : p.x - 1,
          z: p.z + dz,
        })
      )
        return "Leave a walking route along the left edge of every project.";
  for (const p of proposed.projects) {
    if (
      p.rotation &&
      ["home", "workshop", "kitchen", "wash-station", "eco_toilet"].includes(
        PROJECTS[p.key].kind,
      ) &&
      !route(proposed, s.stock, buildingFront(p))
    )
      return "Leave a walking route to the building entrance.";
  }
  return "";
}
function gradeFoundation(s, key, x, z, rotation = 0) {
  if (["road", "bridge"].includes(key)) return;
  const [w, d] = footprint({ key, rotation });
  const pad = foundationPad(x, z, w, d, s.elevationSeed, s.terrainPads);
  s.terrainPads ??= [];
  if (
    pad &&
    !s.terrainPads.some((p) => Object.keys(pad).every((k) => p[k] === pad[k]))
  )
    s.terrainPads.push(pad);
}
export function plan(s, key, x, z, rotation = 0) {
  if (s.stage !== "playing") return "Choose your campsite first.";
  const def = PROJECTS[key];
  if (!def) return "Unknown project.";
  if (
    s.mode !== "sandbox" &&
    s.projects.some((p) => p.key === key) &&
    !def.repeatable
  )
    return "Already planned. Select it to change priority or move it.";
  const error = placementError(s, key, x, z, null, rotation);
  if (error) return error;
  const purchase = blueprintPurchase(s, key);
  if (purchase.error) return purchase.error;
  for (const r of s.people)
    if (
      [
        "relax",
        "idle",
        "look",
        "stretch",
        "chat",
        "stroll",
        "breathe",
      ].includes(r.action)
    ) {
      r.walk = [];
      r.target = null;
    }
  for (const [id, n] of Object.entries(
    s.mode === "sandbox" ? {} : def.materials,
  )) {
    const reserved = n - (purchase.items[id] || 0);
    if (id === "wood") s.wood -= reserved;
    else s.materials[id] -= reserved;
  }
  s.money -= purchase.cost;
  gradeFoundation(s, key, x, z, rotation);
  const instant = key !== "road" && s.mode === "sandbox" && s.instantBuild !== false;
  s.projects.push({
    id: s.nextId++,
    key,
    x,
    z,
    rotation,
    work: instant ? def.work : 0,
    delivered: s.mode === "sandbox" ? requiredLoads(key) : 0,
    ...(Object.keys(purchase.items).length ? {pendingMaterials: purchase.items} : {}),
  });
  for (const r of s.people) {
    r.walk = [];
    r.target = null;
  }
  say(
    s,
    s.mode === "sandbox"
      ? `${def.name} ${instant ? "built" : "queued for resident construction"}. No materials spent.`
      : purchase.cost ? `${def.name} planned. Missing materials purchased for R$${purchase.cost.toFixed(2)}; pickup ${s.trip ? "queued after the current trip" : "being arranged"}.`
      : `${def.name} planned. Materials reserved; friends will bring them over.`,
  );
  dispatchBlueprintPickup(s);
  return "";
}
export function planRoadLine(s, from, to) {
  const cells = roadLine(from, to);
  if (!cells) return "Extend roads in a straight row or column.";
  const draft = structuredClone(s);
  let added = 0;
  for (const c of cells) {
    if (
      draft.projects.some((p) => p.key === "road" && p.x === c.x && p.z === c.z)
    )
      continue;
    const error = plan(draft, "road", c.x, c.z);
    if (error) return `Road not placed: ${error}`;
    added++;
  }
  if (!added) return "These road tiles are already planned.";
  Object.assign(s, draft);
  say(
    s,
    `${added} road tiles planned. Shift-click along the same row or column to extend.`,
  );
  return "";
}
export function moveProject(s, id, x, z, rotation = undefined) {
  const p = s.projects.find((p) => p.id === id);
  if (!p || s.stage !== "playing") return "Cannot move that now.";
  if (
    s.people.some(
      (r) => r.restSite === id && (r.tentPhase || r.action === "rest"),
    )
  )
    return "Wait until residents have finished resting here.";
  if (
    s.infrastructure?.links.some(
      (l) => !l.automatic && (l.from === id || l.to === id),
    )
  )
    return "Disconnect utility lines before relocating this building.";
  rotation ??= p.rotation || 0;
  const error = placementError(s, p.key, x, z, id, rotation);
  if (error) return error;
  gradeFoundation(s, p.key, x, z, rotation);
  p.x = x;
  p.z = z;
  p.rotation = rotation;
  for (const r of s.people) {
    r.target = null;
    r.walk = [];
    if (r.job === id) {
      r.job = null;
      r.workSpot = null;
      r.cargo = false;
      r.action = "idle";
    }
  }
  say(
    s,
    `${PROJECTS[p.key].name} moved. Temporary camp arrangements are free to reposition.`,
  );
  return "";
}
export function prioritize(s, id) {
  const i = s.projects.findIndex((p) => p.id === id);
  if (i < 0) return;
  s.projects.unshift(...s.projects.splice(i, 1));
  for (const r of s.people) if (r.job && !r.cargo && !r.needTask) {
    r.job = null; r.workSpot = null; r.supplyGoal = null; r.walk = []; r.target = null;
  }
  say(
    s,
    "The group will pick up this project next. Current carrying trips finish first.",
  );
}
export function supplyRun(s, material = "wood", project = null) {
  const item = MATERIALS[material];
  if (
    !item ||
    !item.quantity ||
    (!project && storedMaterials(s) + item.quantity > storageCapacity(s)) ||
    s.stage !== "playing" ||
    s.trip ||
    (!project && s.money < item.price)
  )
    return false;
  const vehicle = s.nextTripVehicle || 0;
  const r = s.people
    .filter((r) => r.energy > 35 && !r.cargo && !r.tentPhase && !r.needTask && Object.entries(ensureNeeds(r)).every(([key,value])=>value>25 || (key==="hunger" && ["food","meals"].includes(material))))
    .sort((a, b) => b.energy - a.energy)
    .find(r => route(s, r, carDoor(vehicle)));
  if (!r) return false;
  if (!project) s.money -= item.price;
  s.nextTripVehicle = 1 - vehicle;
  s.trip = {
    person: r.id,
    left: townDuration(s.worldSettings?.town),
    duration: townDuration(s.worldSettings?.town),
    material,
    ...(project ? {project: project.id} : {}),
    vehicle,
    phase: "boarding",
  };
  r.job = null;
  r.target = null;
  r.walk = [];
  r.action = "town";
  r.toiletSite = null;
  r.toiletTime = 0;
  r.washSite = null;
  if (s.opening) s.opening.townTrips++;
  say(
    s,
    project ? `${r.name} is heading to town to collect the prepaid materials for ${PROJECTS[project.key].name}.` : `${r.name} is heading to the car for town: ${item.quantity} ${item.name} for R$${item.price}. Back in about a minute.`,
  );
  return true;
}
export function resolveRain(s, choice) {
  if (!s.rainSeen || s.rainResolved) return false;
  if (choice === "boards") {
    if (s.wood < 2) return false;
    s.wood -= 2;
  } else if (choice !== "move") return false;
  s.rainResolved = true;
  s.rain = false;
  if (choice === "move") {
    s.stock = { x: 31, z: 24 };
    for (const r of s.people) {
      r.target = null;
      r.walk = [];
    }
  }
  say(
    s,
    choice === "boards"
      ? "Spare boards keep the supplies above the puddles."
      : "The group shifts supplies to higher ground. The carrying route is a little longer.",
  );
  return true;
}
function blockedCamp(s) {
  const c = campLocation(s);
  const cells = [
    ...[31, 32, 33, 34].flatMap((x) => [20, 21, 22].map((z) => ({ x, z: z - ROAD_SHIFT / 2 }))),
    { x: 30, z: 24 - ROAD_SHIFT / 2 },
    ...[
      [25, 29],
      [25, 33],
      [27, 28],
    ].map(([x, z]) => ({ x, z })),
  ];
  if (c)
    for (let x = c.x - 1; x <= c.x + 3; x++)
      for (let z = c.z - 3; z < c.z; z++) cells.push({ x, z });
  return cells;
}
function occupied(s, x, z) {
  return (
    (riverBankAt(x, z, 0.5, s.landSeed) && !crossingAt(s, x, z)) ||
    blockedCamp(s).some((c) => c.x === x && c.z === z) ||
    s.projects.some(
      (p) =>
        !(
          p.key === "road" || (p.key === "bridge" && p.work >= PROJECTS[p.key].work)
        ) &&
        !(
          p.work >= PROJECTS[p.key].work &&
          (["shed", "rain-shelter"].includes(PROJECTS[p.key].kind) ||
            (COMMUNITY[PROJECTS[p.key].kind]?.sheltered &&
              shelteredFrontCell(p, x, z)))
        ) &&
        x >= p.x &&
        x < p.x + footprint(p)[0] &&
        z >= p.z &&
        z < p.z + footprint(p)[1],
    )
  );
}
// Test the whole swept body, not just waypoint cells. Expanded cell rectangles
// leave shoulders clear of tents, construction sites and the riverbank.
export function walkSegmentClear(s, from, to) {
  const radius = 0.16;
  const minX = Math.floor(Math.min(from.x, to.x) - 0.5 - radius);
  const maxX = Math.ceil(Math.max(from.x, to.x) + 0.5 + radius);
  const minZ = Math.floor(Math.min(from.z, to.z) - 0.5 - radius);
  const maxZ = Math.ceil(Math.max(from.z, to.z) + 0.5 + radius);
  for (let x = minX; x <= maxX; x++)
    for (let z = minZ; z <= maxZ; z++) {
      if (!occupied(s, x, z)) continue;
      let enter = 0,
        leave = 1;
      for (const [a, b, center] of [
        [from.x, to.x, x],
        [from.z, to.z, z],
      ]) {
        const delta = b - a,
          low = center - 0.5 - radius,
          high = center + 0.5 + radius;
        if (Math.abs(delta) < 1e-9) {
          if (a < low || a > high) {
            enter = 2;
            break;
          }
        } else {
          const t1 = (low - a) / delta,
            t2 = (high - a) / delta;
          enter = Math.max(enter, Math.min(t1, t2));
          leave = Math.min(leave, Math.max(t1, t2));
        }
      }
      if (enter <= leave) {
        // A newly unpacked tent/project can enclose someone already standing there.
        // Permit only outward progress until their body clears that footprint.
        const penetration = (p) =>
          Math.min(0.66 - Math.abs(p.x - x), 0.66 - Math.abs(p.z - z));
        if (
          penetration(from) >= 0 &&
          penetration(to) < penetration(from) - 1e-8
        )
          continue;
        return false;
      }
    }
  return true;
}
function naturalPath(s, from, path) {
  const keepRoad =
    roadAt(s, from.x, from.z) && path.every((p) => roadAt(s, p.x, p.z));
  const roadClear = (a, b) => {
    if (!keepRoad) return true;
    const steps = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) * 3);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      if (!roadAt(s, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t))
        return false;
    }
    return true;
  };
  const direct = [from];
  for (let i = 0; i < path.length; ) {
    let far = path.length - 1;
    while (
      far > i &&
      (!walkSegmentClear(s, direct.at(-1), path[far]) ||
        !roadClear(direct.at(-1), path[far]))
    )
      far--;
    direct.push(path[far]);
    i = far + 1;
  }
  const curved = [from];
  for (let i = 1; i < direct.length - 1; i++) {
    const a = direct[i - 1],
      b = direct[i],
      c = direct[i + 1];
    const trim = Math.min(
      0.4,
      Math.hypot(b.x - a.x, b.z - a.z) / 3,
      Math.hypot(c.x - b.x, c.z - b.z) / 3,
    );
    const toward = (p) => {
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      return {
        x: b.x + ((p.x - b.x) * trim) / d,
        z: b.z + ((p.z - b.z) * trim) / d,
      };
    };
    const entry = toward(a),
      exit = toward(c),
      bend = [entry];
    for (let j = 1; j <= 4; j++) {
      const t = j / 4,
        u = 1 - t;
      bend.push({
        x: u * u * entry.x + 2 * u * t * b.x + t * t * exit.x,
        z: u * u * entry.z + 2 * u * t * b.z + t * t * exit.z,
      });
    }
    const points = [curved.at(-1), ...bend, c];
    if (points.slice(1).every((p, j) => walkSegmentClear(s, points[j], p)))
      curved.push(...bend);
    else curved.push(b);
  }
  if (direct.length > 1) curved.push(direct.at(-1));
  return curved.slice(1);
}
// The grid finds a safe corridor; residents follow continuous shortcuts and bends.
export function route(s, from, to) {
  // This river runs across the whole plot. Without a completed crossing,
  // searching thousands of cells on the opposite bank cannot find a route.
  const bank = point => Math.sign((point.x-32)*2 - riverCenter((point.z-32)*2,s.landSeed));
  if (bank(from) !== bank(to) && !s.projects.some(p=>p.key === "bridge" && p.work >= PROJECTS[p.key].work)) return null;
  const start = [Math.round(from.x), Math.round(from.z)],
    end = [Math.round(to.x), Math.round(to.z)];
  const key = (x, z) => `${x},${z}`;
  if (start[0] === end[0] && start[1] === end[1])
    return walkSegmentClear(s, from, to)
      ? Math.hypot(from.x - to.x, from.z - to.z) > 0.001
        ? [{ x: to.x, z: to.z }]
        : []
      : null;
  const queue = new PathQueue(),
    parent = new Map([[key(...start), null]]),
    costs = new Map([[key(...start), 0]]);
  queue.push({ x: start[0], z: start[1], cost: 0, priority: 0 });
  while (queue.length) {
    const { x, z, cost } = queue.pop();
    if (cost > costs.get(key(x, z))) continue;
    if (x === end[0] && z === end[1]) {
      const path = [];
      let k = key(x, z);
      while (parent.get(k) !== null) {
        const [px, pz] = k.split(",").map(Number);
        path.unshift({ x: px, z: pz });
        k = parent.get(k);
      }
      if (path.length && (to.x !== end[0] || to.z !== end[1]))
        path.push({ x: to.x, z: to.z });
      const result = [];
      let anchor = from,
        chunk = [],
        onRoad = roadAt(s, from.x, from.z);
      for (const point of path) {
        const nextRoad = roadAt(s, point.x, point.z);
        if (nextRoad !== onRoad && chunk.length) {
          result.push(...naturalPath(s, anchor, chunk));
          anchor = chunk.at(-1);
          chunk = [];
        }
        chunk.push(point);
        onRoad = nextRoad;
      }
      result.push(...naturalPath(s, anchor, chunk));
      return result;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        k = key(nx, nz);
      if (
        nx < CELL_MIN + 1 ||
        nx > CELL_MAX - 2 ||
        nz < CELL_MIN + 1 ||
        nz > CELL_MAX - 2 ||
        occupied(s, nx, nz)
      )
        continue;
      const nextCost = cost + (roadAt(s, nx, nz) ? 0.65 : 1);
      if (nextCost >= (costs.get(k) ?? Infinity)) continue;
      costs.set(k, nextCost);
      parent.set(k, key(x, z));
      queue.push({
        x: nx,
        z: nz,
        cost: nextCost,
        priority:
          nextCost + 0.65 * (Math.abs(nx - end[0]) + Math.abs(nz - end[1])),
      });
    }
  }
  return null;
}
function go(s, r, target) {
  if (Math.hypot(r.x - target.x, r.z - target.z) < 0.01) {
    r.target = null;
    r.walk = [];
    return true;
  }
  if (!r.target || r.target.x !== target.x || r.target.z !== target.z) {
    r.target = target;
    r.walk = route(s, r, target) || [];
  }
  if (!r.walk.length) {
    r.target = null;
    return Math.hypot(r.x - target.x, r.z - target.z) < 1;
  }
  return false;
}
const restingPlaces = new WeakMap();
export function tentDoor(s, i) {
  const camp = campLocation(s);
  return { x: camp.x + (i % 2) * 1.5, z: camp.z };
}
export function restingDoor(s, i) {
  const r = s.people[i];
  const p = s.projects.find((p) => p.id === r.restSite);
  if (!p) return tentDoor(s, i);
  return buildingFront(p);
}
function chooseRestingPlace(s, r, i) {
  if (r.restSite && s.projects.some((p) => p.id === r.restSite)) return;
  const choices = s.projects.filter(
    (p) =>
      p.work >= PROJECTS[p.key].work &&
      (PROJECTS[p.key].kind === "home" || p.key.startsWith("canvas-tent")) &&
      s.infrastructure.nodes[p.id]?.enabled !== false &&
      s.people.filter((other) => other !== r && other.restSite === p.id)
        .length < (PROJECTS[p.key].beds || 2),
  );
  choices.sort(
    (a, b) =>
      (PROJECTS[b.key].kind === "home") - (PROJECTS[a.key].kind === "home") ||
      Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z),
  );
  for (const p of choices) {
    r.restSite = p.id;
    if (route(s, r, restingDoor(s, i))) return;
  }
  r.restSite = null;
}
function restSpot(s, i) {
  const layout = JSON.stringify([
    s.camp,
    s.projects.map((p) => [p.id, p.x, p.z, finished(s, p.key)]),
  ]);
  let cache = restingPlaces.get(s);
  if (!cache || cache.layout !== layout) {
    cache = { layout, spots: [] };
    restingPlaces.set(s, cache);
  }
  if (cache.spots[i]) return cache.spots[i];
  const c = campLocation(s);
  const p = s.projects.find(
    (p) => PROJECTS[p.key].kind === "square" && p.work >= PROJECTS[p.key].work,
  );
  const origin = p || c;
  const offsets = [
    [-1, 0],
    [-1, 1],
    [2, 0],
    [2, 1],
    [0, 2],
    [-2, 2],
    [2, 2],
    [-2, 0],
    [0, 3],
  ];
  for (let j = 0; j < offsets.length; j++) {
    const [x, z] = offsets[(i + j) % offsets.length],
      target = { x: origin.x + x, z: origin.z + z };
    if (
      !occupied(s, target.x, target.z) &&
      !cache.spots.some(
        (spot) => spot && spot.x === target.x && spot.z === target.z,
      ) &&
      route(s, s.people[i], target)
    ) {
      cache.spots[i] = target;
      return target;
    }
  }
  return { x: 31, z: 24 };
}
function supplySpot(s, r, i) {
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, 1],
    [1, 1],
    [-2, 0],
    [2, 0],
  ];
  for (let n = 0; n < offsets.length; n++) {
    const [dx, dz] = offsets[(n + i) % offsets.length],
      goal = { x: s.stock.x + dx, z: s.stock.z + dz };
    if (
      occupied(s, goal.x, goal.z) ||
      s.people.some(
        (other) =>
          other !== r &&
          ((other.target &&
            other.target.x === goal.x &&
            other.target.z === goal.z) ||
            Math.hypot(other.x - goal.x, other.z - goal.z) < 0.6),
      )
    )
      continue;
    if (route(s, r, goal)) return goal;
  }
  return { x: s.stock.x - 2, z: s.stock.z + 1 };
}
function workSpot(s, r, p) {
  const reserved = s.people
    .filter((other) => other !== r && other.job === p.id && other.workSpot)
    .map((other) => other.workSpot);
  const [w, d] = footprint(p);
  const offsets = [];
  for (let z = 0; z < d; z++) {
    offsets.push([-1, z], [w, z]);
  }
  for (let x = 0; x < w; x++) {
    offsets.push([x, d], [x, -1]);
  }
  return offsets
    .map(([x, z]) => ({ x: p.x + x, z: p.z + z }))
    .sort((a,b) => Math.hypot(a.x-r.x,a.z-r.z) - Math.hypot(b.x-r.x,b.z-r.z))
    .find(
      (spot) =>
        !occupied(s, spot.x, spot.z) &&
        !s.people.some(
          (other) =>
            other !== r &&
            !other.tentPhase &&
            (Math.hypot(other.x - spot.x, other.z - spot.z) < 0.55 ||
              (other.target?.x === spot.x && other.target?.z === spot.z)),
        ) &&
        !reserved.some((other) => other.x === spot.x && other.z === spot.z) &&
        route(s, r, spot),
    );
}
function availableProject(s, r) {
  return s.projects.find(
    (p) => !p.pendingMaterials && p.work < PROJECTS[p.key].work &&
      s.people.filter(other => other !== r && other.job === p.id).length < crewLimit(PROJECTS[p.key]) && workSpot(s, r, p),
  );
}
function idleActivity(s, r, i, dt) {
  if (r.idleUntil > s.time) {
    if (r.idleGoal && go(s, r, r.idleGoal) && r.action === "stroll")
      r.action = "look";
    r.energy = Math.min(
      100,
      r.energy + dt * 10 * (COMMUNITY[r.leisureKind]?.recovery || 0.025),
    );
    return;
  }
  const c = campLocation(s);
  r.leisureKind = null;
  const cycle = r.idleCycle || 0;
  r.idleCycle = cycle + 1;
  const social = s.projects.filter(
    (p) =>
      p.work >= PROJECTS[p.key].work &&
      (s.rain
        ? ["shed", "rain-shelter"].includes(PROJECTS[p.key].kind) ||
          COMMUNITY[PROJECTS[p.key].kind]?.sheltered
        : [
            "square",
            "picnic-table",
            "garden-bench",
            "fire-circle",
            ...Object.keys(COMMUNITY),
          ].includes(PROJECTS[p.key].kind)),
  );
  if (social.length && (s.rain || cycle % 2 === 0)) {
    const p = social[(i + Math.floor(cycle / 2)) % social.length];
    let spot = workSpot(s, r, p);
    if (
      ["shed", "rain-shelter"].includes(PROJECTS[p.key].kind) ||
      COMMUNITY[PROJECTS[p.key].kind]?.sheltered
    ) {
      spot = Array.from(
        { length: footprint(p)[0] * footprint(p)[1] },
        (_, n) => ({
          x: p.x + (n % footprint(p)[0]),
          z: p.z + Math.floor(n / footprint(p)[0]),
        }),
      )
        .filter((c) => shelteredFrontCell(p, c.x, c.z))
        .find(
          (candidate) =>
            !s.people.some(
              (other) =>
                other !== r &&
                (Math.hypot(other.x - candidate.x, other.z - candidate.z) <
                  0.65 ||
                  (other.idleGoal?.x === candidate.x &&
                    other.idleGoal?.z === candidate.z)),
            ) && route(s, r, candidate),
        );
    }
    if (spot) {
      r.idleGoal = spot;
      r.idleUntil = s.time + 25 + i * 2;
      r.action = "relax";
      r.leisureKind = PROJECTS[p.key].kind;
      r.lookAt = null;
      r.target = null;
      go(s, r, spot);
      return;
    }
  }
  const activities = ["look", "stretch", "chat", "stroll", "breathe"];
  r.action = activities[(cycle + i) % activities.length];
  r.lookAt = null;
  let goal = null;
  if (r.action === "chat") {
    const friend = s.people.find(
      (other) =>
        other !== r &&
        !other.job &&
        !other.walk.length &&
        ["look", "breathe", "stretch", "chat", "relax"].includes(
          other.action,
        ) &&
        Math.hypot(other.x - r.x, other.z - r.z) < 5,
    );
    if (friend) {
      r.lookAt = friend.id;
      friend.lookAt = r.id;
      friend.action = "chat";
      friend.idleUntil = s.time + 16;
      friend.idleGoal = null;
      goal = {
        x: Math.round(friend.x) + (i % 2 ? 1 : -1),
        z: Math.round(friend.z),
      };
    } else r.action = "look";
  }
  if (r.action === "stroll" || r.action === "breathe") {
    const spots = [
      [c.x - 3, c.z + 2],
      [c.x + 4, c.z + 3],
      [c.x + 1, c.z + 4],
      [c.x - 2, c.z + 4],
      [c.x + 4, c.z + 1],
    ];
    const [x, z] = spots[(cycle * 2 + i) % spots.length];
    goal = { x, z };
  }
  if (
    goal &&
    !occupied(s, goal.x, goal.z) &&
    !s.people.some(
      (other) =>
        other !== r &&
        (Math.hypot(other.x - goal.x, other.z - goal.z) < 0.8 ||
          (other.idleGoal?.x === goal.x && other.idleGoal?.z === goal.z)),
    ) &&
    route(s, r, goal)
  ) {
    r.idleGoal = goal;
    r.target = null;
    go(s, r, goal);
  } else r.idleGoal = null;
  r.idleUntil = s.time + 18 + i * 2 + (cycle % 3) * 5;
}
export function canFinish(s) {
  if (s.mode === "sandbox") return false;
  if (s.opening && !s.opening.complete)
    return openingProgress(s, PROJECTS).ready;
  return (
    finished(s, "gathering") &&
    s.projects.some((p) => p.key !== "gathering" && finished(s, p.key)) &&
    !s.trip &&
    (!s.rainSeen || s.rainResolved)
  );
}
export function endWeekend(s) {
  if (!canFinish(s) || s.stage !== "playing") return false;
  if (s.opening) s.opening.complete = true;
  s.stage = "evening";
  s.meal = true;
  for (const r of s.people) {
    r.job = null;
    r.target = null;
    r.walk = [];
    r.cargo = false;
  }
  say(s, "Tools down. Our first meal on our own land.");
  return true;
}
export function tick(s, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  if(s.arrivalAnimating){
    s.arrivalElapsed=Math.min(ARRIVAL_DURATION,s.arrivalElapsed+Math.min(dt,1));
    if(s.arrivalElapsed>=ARRIVAL_DURATION)s.arrivalAnimating=false;
    return;
  }
  if (s.stage === "arrival") {
    s.arrivalElapsed = ARRIVAL_DURATION;
    return;
  }
  dt = Math.min(dt, 1);
  if (s.mode === "sandbox") sandboxSupplies(s);
  s.time += dt;
  autoConnectUtilities(s, PROJECTS);
  infrastructureStep(s, PROJECTS, dt);
  for (const p of s.projects) {
    if (!p.repeat || s.operations?.some((o) => o.site === p.id && !o.done))
      continue;
    const recipe = PROCESSES[p.repeat];
    if (recipe && materialCount(s, Object.keys(recipe.output)[0]) < 24)
      p.productionStatus = queueProduction(s, p.id, p.repeat);
  }

  for (const [i,r] of s.people.entries()) decayNeeds(s,r,i,dt);
  s.infrastructure.hungry = s.people.some(r=>r.needs.hunger<15);
  const needApi = {
    route: (r,point)=>route(s,r,point),
    go: (r,point)=>go(s,r,point),
    serviceSpot: (node,r)=>utilitySpot(s,node,r),
    camp: ()=>campLocation(s)||s.stock,
    river: ()=>riverAccess(s.landSeed),
    groundSpot: (r,center,index,privateBreak=false)=>{
      const radius=privateBreak?6:1;
      for(let ring=radius;ring<=radius+2;ring++)for(let j=0;j<12;j++) {
        const angle=(j+index)*Math.PI/6;
        const point={x:Math.round(center.x+Math.cos(angle)*ring),z:Math.round(center.z+Math.sin(angle)*ring)};
        if(point.x<CELL_MIN+2 || point.x>CELL_MAX-2 || point.z<CELL_MIN+2 || point.z>CELL_MAX-2 || occupied(s,point.x,point.z))continue;
        if(privateBreak && (riverBankAt(point.x,point.z,5,s.landSeed) || Math.hypot(point.x-s.stock.x,point.z-s.stock.z)<5))continue;
        if(s.people.some(p=>p!==r && ((p.needTask && Math.hypot(p.needTask.target.x-point.x,p.needTask.target.z-point.z)<.8) || Math.hypot(p.x-point.x,p.z-point.z)<.7)))continue;
        if(route(s,r,point))return point;
      }
      return null;
    },
  };
  dispatchBlueprintPickup(s);
  if (s.trip) {
    const trip = s.trip,
      r = s.people.find((r) => r.id === trip.person);
    if (trip.phase === "boarding" || trip.phase === "unloading") {
      const target =
        trip.phase === "boarding"
          ? carDoor(trip.vehicle)
          : { x: s.stock.x, z: s.stock.z };
      r.target = target;
      if (!r.walk.length) r.walk = route(s, r, target) || [];
      const next = r.walk[0];
      if (next) {
        const distance = Math.hypot(next.x - r.x, next.z - r.z);
        r.moveSpeed = Math.min(0.95, (r.moveSpeed || 0) + dt * 1.8);
        const step = Math.min(distance, dt * r.moveSpeed);
        const candidate = {
          x: r.x + (distance ? ((next.x - r.x) / distance) * step : 0),
          z: r.z + (distance ? ((next.z - r.z) / distance) * step : 0),
        };
        if (walkSegmentClear(s, r, candidate)) {
          r.x = candidate.x;
          r.z = candidate.z;
          if (distance <= step + 0.001) r.walk.shift();
        } else r.walk = [];
      }
      if (Math.hypot(r.x - target.x, r.z - target.z) < 0.025) {
        r.walk = [];
        r.target = null;
        r.moveSpeed = 0;
        if (trip.phase === "boarding") trip.phase = "outbound";
        else {
          const id = trip.material,
            item = MATERIALS[id];
          const project = s.projects.find(p => p.id === trip.project);
          const orders = trip.projects || [trip.project];
          if (project) for (const p of s.projects.filter(p=>orders.includes(p.id))) delete p.pendingMaterials;
          else if (id === "wood") s.wood += item.quantity;
          else s.materials[id] += item.quantity;
          r.action = "idle";
          r.cargo = false;
          s.trip = null;
          say(
            s,
            project ? `${r.name} unloaded reserved materials for ${orders.length === 1 ? PROJECTS[project.key].name : `${orders.length} projects`}. Construction can begin.` : `${r.name} unloaded ${item.quantity} ${item.name} from the car.`,
          );
        }
      }
    } else {
      trip.left = Math.max(0, trip.left - dt);
      trip.phase =
        trip.left > (trip.duration||TRIP_DURATION) - DRIVE_DURATION
          ? "outbound"
          : trip.left > DRIVE_DURATION
            ? "away"
            : trip.left > 0
              ? "inbound"
              : "unloading";
      if (trip.phase === "unloading") {
        Object.assign(r, carDoor(trip.vehicle));
        r.walk = [];
        r.target = null;
        r.cargo = true;
      }
    }
  }
  if (
    s.stage === "playing" &&
    (s.opening && !s.opening.complete
      ? s.time >= 240/waterFactor(s.worldSettings?.water)
      : s.time >= 150/waterFactor(s.worldSettings?.water) ||
        s.projects.some(
          (p) => p.key !== "gathering" && p.work >= PROJECTS[p.key].work / 2,
        )) &&
    !s.rainSeen &&
    s.projects.length
  ) {
    s.rainSeen = true;
    s.rainAt = s.time;
    s.rain = true;
    s.rainResolved = true;
    say(s, "A short shower passes through. The supplies stay dry.");
  }
  if (
    s.opening &&
    s.rainSeen &&
    !s.rainResolved &&
    openingProgress(s, PROJECTS).supplies
  ) {
    s.rainResolved = true;
    say(
      s,
      "Bento: The supplies are covered now. Good call getting that built.",
    );
  }
  if (s.rainResolved && s.time > (s.rainAt ?? 150) + 35) s.rain = false;
  for (const [i, r] of s.people.entries()) {
    if (r.action === "town") continue;
    chooseNeed(s,r,i,needApi);
    if (r.tentPhase) {
      r.action = "rest";
      if (r.tentPhase === "enter" && s.time - r.tentAt >= 1.5)
        r.tentPhase = "inside";
      if (r.tentPhase === "inside") {
        r.energy = Math.min(100, r.energy + dt * 1.4);
        const recovered = s.projects.some((p) => p.work < PROJECTS[p.key].work)
          ? 60
          : 80;
        if (r.energy >= recovered || s.stage === "evening") {
          r.tentPhase = "exit";
          r.tentAt = s.time;
        }
      }
      if (r.tentPhase === "exit" && s.time - r.tentAt >= 1.5) {
        r.tentPhase = null;
        r.restSite = null;
        r.action = "idle";
      }
      continue;
    }
    // Leisure is interruptible: a newly available task beats finishing a stroll.
    if (
      s.stage === "playing" &&
      !r.job &&
      !r.needTask &&
      r.energy >= 25 &&
      [
        "idle",
        "relax",
        "look",
        "stretch",
        "chat",
        "stroll",
        "breathe",
      ].includes(r.action) &&
      availableProject(s, r)
    ) {
      r.walk = [];
      r.target = null;
      r.idleUntil = 0;
      r.idleGoal = null;
    }
    if (r.energy < 25 && r.job && !r.cargo && !r.needTask) {
      r.walk=[]; r.target=null; r.job=null; r.supplyGoal=null;
    }
    if (r.walk.length) {
      const next = r.walk[0],
        dx = next.x - r.x,
        dz = next.z - r.z,
        d = Math.hypot(dx, dz),
        desiredSpeed =
          (r.cargo ? 0.72 : 0.95) *
          (0.92 + i * 0.035) *
          (r.energy < 35 ? 0.8 : 1),
        braking = r.walk.length === 1 ? Math.max(0.25, Math.min(1, d * 2)) : 1;
      r.moveSpeed = Math.min(
        desiredSpeed * braking,
        (r.moveSpeed || 0) + dt * 1.8,
      );
      const nearby = s.people.filter(
        (other) =>
          other !== r &&
          other.action !== "town" &&
          Math.hypot(other.x - r.x, other.z - r.z) < 0.75,
      );
      const step = dt * r.moveSpeed * (nearby.length ? 0.65 : 1);
      const travel = Math.min(step, d);
      const candidate = {
        x: r.x + (d ? (dx / d) * travel : 0),
        z: r.z + (d ? (dz / d) * travel : 0),
      };
      if (d > 0.1 && nearby.length) {
        const sidestep = {
          x: candidate.x + (dz / d) * dt * 0.18,
          z: candidate.z - (dx / d) * dt * 0.18,
        };
        if (
          walkSegmentClear(s, r, sidestep) &&
          walkSegmentClear(s, sidestep, next)
        ) {
          candidate.x = sidestep.x;
          candidate.z = sidestep.z;
        }
      }
      if (walkSegmentClear(s, r, candidate)) {
        r.x = candidate.x;
        r.z = candidate.z;
        if (Math.hypot(r.x - next.x, r.z - next.z) < 0.015) r.walk.shift();
      } else {
        r.walk = route(s, r, r.target || next) || [];
      }
      r.energy = Math.max(0, r.energy - dt * 0.025);
      continue;
    }
    r.moveSpeed = 0;
    if (s.stage === "evening") {
      r.action = "meal";
      go(s, r, restSpot(s, i));
      continue;
    }
    if (advanceNeed(s,r,dt,needApi)) continue;
    if (
      !r.cargo && (r.energy < 25 ||
      (r.action === "rest" &&
        r.energy <
          (s.projects.some((p) => p.work < PROJECTS[p.key].work) ? 60 : 80)))
    ) {
      r.action = "rest";
      r.job = null;
      r.workSpot = null;
      r.cargo = false;
      chooseRestingPlace(s, r, i);
      if (go(s, r, restingDoor(s, i))) {
        r.tentPhase = "enter";
        r.tentAt = s.time;
        r.walk = [];
        r.target = null;
      }
      continue;
    }
    if (
      r.operation &&
      s.operations?.some(
        (o) =>
          o.id === r.operation &&
          !o.done &&
          (o.phase === "return" || (o.water && o.phase === "deliver")),
      )
    ) {
      if (operationalWork(s, r, i, dt)) continue;
    }
    let p = s.projects.find(
      (p) => p.id === r.job && !p.pendingMaterials && p.work < PROJECTS[p.key].work,
    );
    if (!p) {
      r.job = null;
      r.workSpot = null;
      r.cargo = false;
      p = availableProject(s, r);
      if (p) {
        r.workSpot = workSpot(s, r, p);
        r.job = p.id;
        r.idleUntil = 0;
        r.idleGoal = null;
        r.lookAt = null;
        r.supplyGoal = null;
        r.target = null;
      }
    }
    if (!p) {
      if (operationalWork(s, r, i, dt)) continue;
      idleActivity(s, r, i, dt);
      r.energy = Math.min(100, r.energy + dt * 0.25);
      continue;
    }
    if (!r.workSpot || occupied(s, r.workSpot.x, r.workSpot.z))
      r.workSpot = workSpot(s, r, p);
    if (!r.workSpot) {
      r.job = null;
      continue;
    }
    const dest = r.workSpot;
    const loads = requiredLoads(p.key);
    // Reserved supplies begin at the receiving stockpile. Storage only helps
    // after a resident physically stages a larger batch there.
    const transit = s.people.filter(other => other.job === p.id && other.cargo);
    const inTransit = transit.reduce((n,other) => n + carriedLoads(other), 0);
    const remaining = Math.max(0, loads - p.delivered - (p.staged || 0) - inTransit);
    let depot = s.projects.find(other => other.id === p.depot && other.work >= PROJECTS[other.key].work);
    if (!depot && !(p.staged > 0)) {
      depot = s.projects.filter(other => other.id !== p.id && STORAGE_KINDS.includes(PROJECTS[other.key].kind) && other.work >= PROJECTS[other.key].work &&
        Math.hypot(other.x-p.x,other.z-p.z) < 8 &&
        Math.hypot(other.x-s.stock.x,other.z-s.stock.z)+Math.hypot(other.x-p.x,other.z-p.z) < Math.hypot(p.x-s.stock.x,p.z-s.stock.z)*1.35)
        .sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))
        .find(other=>workSpot(s,r,other));
      p.depot = depot?.id;
    }
    if (!r.cargo && p.delivered < loads) {
      const staged = (p.staged || 0) > 0 && depot;
      if (!staged && !remaining) {
        r.job=null; r.workSpot=null; r.action='idle'; r.target=null;
        continue;
      }
      r.action = 'collect';
      const source = staged ? workSpot(s,r,depot) : supplySpot(s,r,i);
      if (!source) { r.job=null; continue; }
      const sourceId=staged ? depot.id : 0;
      if(r.supplySource!==sourceId){r.supplyGoal=null;r.walk=[];r.target=null;}
      r.supplySource=sourceId;
      if (!r.supplyGoal) r.supplyGoal=source;
      if (go(s,r,r.supplyGoal)) {
        r.haulLoads = Math.min(staged ? 2 : depot ? 4 : 1, staged ? p.staged : remaining);
        r.haulStage = staged || !depot ? 'site' : 'storage';
        if(staged) p.staged-=r.haulLoads;
        r.supplyGoal=null; r.cargo=true; r.target=null;
      }
      continue;
    }
    r.action = r.cargo ? 'carry' : 'walk';
    const delivery = r.cargo && r.haulStage==='storage' && depot ? workSpot(s,r,depot) : dest;
    if(!delivery || !go(s,r,delivery)) continue;
    if(r.cargo) {
      if(r.haulStage==='storage' && depot) p.staged=(p.staged||0)+carriedLoads(r);
      else p.delivered=Math.min(loads,p.delivered+carriedLoads(r));
      r.cargo=false; r.haulLoads=0; r.haulStage=null;
      r.target=null;
      if(p.delivered<loads) continue;
    }
    if (p.delivered < loads || r.energy < 25) continue;
    r.action = "build";
    const before = p.work;
    p.work = Math.min(
      PROJECTS[p.key].work,
      p.work +
        dt *
          workMultiplier(r,p.key) *
          (s.opening &&
          !s.opening.complete &&
          s.rain &&
          !openingProgress(s, PROJECTS).shelter
            ? 0.8
            : 1) *
          (s.infrastructure?.thirst || r.needs.hunger<15 ? 0.65 : 1),
    );
    r.work += dt;
    r.energy = Math.max(0, r.energy - dt * 0.16);
    if (before < PROJECTS[p.key].work && p.work >= PROJECTS[p.key].work) {
      if (s.opening && !s.opening.complete) {
        const progress = openingProgress(s, PROJECTS);
        for (const [key, line] of Object.entries({
          gathering:
            "Luz: Somewhere to sit together. This is starting to feel like our place.",
          shelter:
            "Nina: A dry place to take a break. We can stop rushing when the rain comes.",
          supplies:
            "Bento: Tools and supplies are protected. We can save the rest of our money for tomorrow.",
        })) {
          if (progress[key] && !s.opening[key]) {
            s.opening[key] = true;
            say(s, line);
          }
        }
      }
      say(
        s,
        `${PROJECTS[p.key].name} is ready. ${p.key === "gathering" ? "Somewhere to sit together at last." : p.key === "shelter" ? "A roof for our first night." : p.key === "water" ? "Water close at hand." : PROJECTS[p.key].kind === "eco_toilet" ? "A little privacy goes a long way." : "Ready for the community to use."}`,
      );
    }
  }
}
export function save(s) {
  return JSON.stringify(s);
}
export function restore(text) {
  try {
    const s = JSON.parse(text);
    if (
      s.version !== 2 ||
      !["arrival", "playing", "evening"].includes(s.stage) ||
      !Array.isArray(s.people) ||
      s.people.length !== 5 ||
      !Array.isArray(s.projects) ||
      s.projects.length > 512
    )
      return null;
    // Retired reclaimed-parts economy: remove obsolete stock, sites and jobs.
    delete s.materials?.salvage;
    const retiredSites=new Set(s.projects.filter(p=>p.key==='supply-4').map(p=>p.id));
    s.projects=s.projects.filter(p=>!retiredSites.has(p.id));
    if(Array.isArray(s.operations))s.operations=s.operations.filter(o=>!retiredSites.has(o.site)&&!['salvage','hardware','tools'].includes(o.recipe));
    if(s.infrastructure?.nodes){
      for(const id of retiredSites)delete s.infrastructure.nodes[id];
      if(Array.isArray(s.infrastructure.links))s.infrastructure.links=s.infrastructure.links.filter(l=>!retiredSites.has(l.from)&&!retiredSites.has(l.to));
    }
    if(s.trip?.material==='salvage'){
      s.money+=30; // Refund the retired shop batch already paid for.
      const traveler=s.people.find(r=>r.id===s.trip.person);
      if(traveler){traveler.action='idle';traveler.x=s.stock.x;traveler.z=s.stock.z;}
      s.trip=null;
    }
    if (
      s.opening &&
      (s.opening.version !== 1 ||
        !Number.isInteger(s.opening.townTrips) ||
        s.opening.townTrips < 0 ||
        (s.opening.complete !== undefined &&
          typeof s.opening.complete !== "boolean"))
    )
      return null;
    if (s.mode !== undefined && s.mode !== "sandbox" && s.mode !== "story")
      return null;
    if (s.instantBuild !== undefined && typeof s.instantBuild !== "boolean")
      return null;
    s.terrainPads ??= [];
    if (
      !Array.isArray(s.terrainPads) ||
      s.terrainPads.length > 4096 ||
      s.terrainPads.filter(p => p?.terraform).length > 1 ||
      s.terrainPads.some(
        (p) =>
          !p || (p.terraform !== undefined ? !validTerrainVertices(p) : (
          ![p.left, p.right, p.top, p.bottom, p.height].every(
            Number.isFinite,
          ) ||
          p.left < -128 ||
          p.right > 128 ||
          p.top < -128 ||
          p.bottom > 128 ||
          p.left >= p.right ||
          p.top >= p.bottom ||
          p.height < 0 ||
          p.height > 12 ||
          [p.left, p.right, p.top, p.bottom].some((n) => n % 2 !== 0))),
      )
    )
      return null;
    s.elevationSeed ??= 0;
    if (
      !Number.isInteger(s.elevationSeed) ||
      s.elevationSeed < 0 ||
      s.elevationSeed > 0xffffffff
    )
      return null;
    s.landSeed ??= 0;
    if (
      !Number.isInteger(s.landSeed) ||
      s.landSeed < 0 ||
      s.landSeed > 0xffffffff
    )
      return null;
    if(s.worldSettings!==undefined){if(!validSettings(s.worldSettings))return null;registerWorld(s.landSeed,s.worldSettings);}
    const fresh = createWeekend();
    s.arrivalElapsed ??= ARRIVAL_DURATION;
    if (
      !Number.isFinite(s.arrivalElapsed) ||
      s.arrivalElapsed < 0 ||
      s.arrivalElapsed > ARRIVAL_DURATION
    )
      return null;
    if(s.arrivalAnimating!==undefined && typeof s.arrivalAnimating!=="boolean") return null;
    if (s.stage === "arrival" && !s.arrivalAnimating) s.arrivalElapsed = ARRIVAL_DURATION;
    if (
      ["rain", "rainSeen", "rainResolved", "meal"].some(
        (k) => typeof s[k] !== "boolean",
      )
    )
      return null;
    if (
      s.stage === "arrival" &&
      (s.projects.length || s.camp !== null || s.trip)
    )
      return null;
    if (
      !Number.isInteger(s.nextId) ||
      s.nextId <= Math.max(0, ...s.projects.map((p) => p.id))
    )
      return null;
    if (
      s.stage !== "arrival" &&
      !(s.camp === "custom"
        ? s.campSite &&
          !campPlacementError(
            { ...s, projects: [] },
            s.campSite.x,
            s.campSite.z,
          )
        : CAMPS.some((c) => c.id === s.camp))
    )
      return null;
    if (s.materials)
      for (const id of Object.keys(MATERIALS))
        if (id !== "wood" && s.materials[id] === undefined) s.materials[id] = 0;
    if (
      !s.materials ||
      Object.keys(MATERIALS)
        .filter((id) => id !== "wood")
        .some((id) => !Number.isInteger(s.materials[id]) || s.materials[id] < 0)
    )
      return null;
    for (const k of ["time", "money", "wood", "nextId"])
      if (!Number.isFinite(s[k]) || s[k] < 0) return null;
    if (
      !s.stock ||
      !Number.isInteger(s.stock.x) ||
      !Number.isInteger(s.stock.z) ||
      s.stock.x < CELL_MIN ||
      s.stock.x > CELL_MAX ||
      s.stock.z < CELL_MIN ||
      s.stock.z > CELL_MAX
    )
      return null;
    // Older saves counted a pair/trio as one item; preserve the actual animals.
    if (s.livestockUnits === undefined) {
      s.materials.goats *= 2;
      s.materials.hens *= 3;
      for (const p of s.projects) {
        if (p.key === "goat_pasture")
          p.delivered = Math.min(requiredLoads(p.key), p.delivered + 1);
        if (p.key === "coop")
          p.delivered = Math.min(requiredLoads(p.key), p.delivered + 2);
      }
      s.livestockUnits = 1;
    }
    if (s.livestockUnits !== 1) return null;
    for (const p of s.projects) {
      if (p.pendingMaterials && (p.work !== 0 || p.delivered !== 0 ||
          !Object.keys(p.pendingMaterials).length || Object.entries(p.pendingMaterials).some(([id,n]) =>
            !Number.isInteger(n) || n <= 0 || !PROJECTS[p.key]?.materials[id] || n > PROJECTS[p.key].materials[id]))) return null;
    }
    if (s.trip?.project !== undefined && !s.projects.some(p => p.id === s.trip.project && p.pendingMaterials)) return null;
    if (s.trip?.projects !== undefined && (!Array.isArray(s.trip.projects) ||
        !s.trip.projects.includes(s.trip.project) || new Set(s.trip.projects).size !== s.trip.projects.length ||
        s.trip.projects.some(id=>!s.projects.some(p=>p.id===id && p.pendingMaterials)))) return null;
    const ids = new Set(),
      keys = new Set();
    for (const p of s.projects) {
      if (
        (p.rotation !== undefined &&
          (!Number.isInteger(p.rotation) ||
            p.rotation < 0 ||
            p.rotation > 3)) ||
        !PROJECTS[p.key] ||
        (s.mode !== "sandbox" &&
          !PROJECTS[p.key]?.repeatable &&
          keys.has(p.key)) ||
        ids.has(p.id) ||
        !Number.isInteger(p.id) ||
        p.id < 1 ||
        !Number.isFinite(p.work) ||
        p.work < 0 ||
        p.work > PROJECTS[p.key].work ||
        !Number.isInteger(p.delivered) ||
        p.delivered < 0 ||
        (p.staged !== undefined && (!Number.isInteger(p.staged) || p.staged < 0 || p.staged + p.delivered > requiredLoads(p.key))) ||
        (p.depot !== undefined && (!Number.isInteger(p.depot) || !s.projects.some(other => other.id === p.depot && STORAGE_KINDS.includes(PROJECTS[other.key].kind)))) ||
        p.delivered > requiredLoads(p.key)
      )
        return null;
      ids.add(p.id);
      keys.add(p.key);
      if (
        placementError(
          { ...s, projects: s.projects.filter((q) => q !== p) },
          p.key,
          p.x,
          p.z,
          null,
          p.rotation || 0,
        )
      )
        return null;
    }
    for (let i = 0; i < 5; i++) {
      const r = s.people[i];
      if (
        r.id !== fresh.people[i].id ||
        !["x", "z", "energy", "work"].every((k) => Number.isFinite(r[k])) ||
        r.x < CELL_MIN ||
        r.x > CELL_MAX ||
        r.z < CELL_MIN ||
        r.z > CELL_MAX ||
        r.energy < 0 ||
        r.energy > 100
      )
        return null;
      if (r.work < 0) return null;
      for (const k of ["washTime", "cleanedAtWork", "toiletAt", "toiletTime"])
        if (r[k] !== undefined && (!Number.isFinite(r[k]) || r[k] < 0))
          return null;
      if (!validNeeds(r)) return null;
      if(r.friendships!==undefined && (!r.friendships || typeof r.friendships!=='object' || Array.isArray(r.friendships) || Object.entries(r.friendships).some(([id,value])=>id===r.id || !fresh.people.some(p=>p.id===id) || !Number.isFinite(value) || value<0 || value>100))) return null;
      ensureNeeds(r,i);
      if (r.cargo && r.haulStage === 'site' && r.haulLoads && r.job) {
        const project=s.projects.find(p=>p.id===r.job);
        if(project?.depot) project.staged=(project.staged||0)+r.haulLoads;
      }
      r.haulLoads=0; r.haulStage=null;
      r.needTask = null;
      r.needRetryAt = 0;
      r.needBlocked = null;
      r.idleUntil = 0;
      r.idleGoal = null;
      r.lookAt = null;
      r.supplyGoal = null;
      r.target = null;
      r.walk = [];
      r.job = null;
      r.workSpot = null;
      r.operation = null;
      r.linkJob = null;
      r.cargo = false;
      if (
        r.tentPhase &&
        (!["enter", "inside", "exit"].includes(r.tentPhase) ||
          !Number.isFinite(r.tentAt) ||
          r.tentAt > s.time ||
          !s.camp)
      )
        return null;
      if (
        r.restSite != null &&
        !s.projects.some(
          (p) =>
            p.id === r.restSite &&
            p.work >= PROJECTS[p.key].work &&
            (PROJECTS[p.key].kind === "home" ||
              p.key.startsWith("canvas-tent")),
        )
      )
        return null;
      r.washSite = null;
      r.toiletSite = null;
      r.toiletTime = 0;
      r.action =
        s.trip?.person === r.id ? "town" : r.tentPhase ? "rest" : "idle";
      r.name = fresh.people[i].name;
    }
    if (
      s.trip &&
      (!Object.hasOwn(MATERIALS, s.trip.material) ||
        !s.people.some((r) => r.id === s.trip.person) ||
        !Number.isFinite(s.trip.left) ||
        s.trip.left < 0 ||
        s.trip.left > (s.trip.duration||TRIP_DURATION) ||
        (s.trip.duration!==undefined && ![45,55,110].includes(s.trip.duration)))
    )
      return null;
    if (s.nextTripVehicle !== undefined && ![0, 1].includes(s.nextTripVehicle))
      return null;
    if (s.trip) {
      s.trip.vehicle ??= 0;
      s.trip.phase ??= s.trip.left > DRIVE_DURATION ? "away" : "inbound";
      if (
        ![0, 1].includes(s.trip.vehicle) ||
        !["boarding", "outbound", "away", "inbound", "unloading"].includes(
          s.trip.phase,
        )
      )
        return null;
      const r = s.people.find((r) => r.id === s.trip.person);
      r.cargo = s.trip.phase === "unloading";
    }
    if (!validInfrastructure(s)) return null;
    if (
      s.infrastructure &&
      Object.values(s.infrastructure.nodes).some(
        (n) =>
          n.id !== 0 &&
          n.id !== -1 &&
          !s.projects.some(
            (p) =>
              p.id === n.id &&
              p.work >= PROJECTS[p.key].work &&
              PROJECTS[p.key].kind === n.kind,
          ),
      )
    )
      return null;
    if (
      s.operations &&
      (!Array.isArray(s.operations) ||
        s.operations.some(
          (o) =>
            !s.infrastructure?.nodes[o.site] ||
            !["pickup", "process", "deliver", "return"].includes(o.phase) ||
            (o.water &&
              o.water.from !== -1 &&
              !s.infrastructure?.nodes[o.water.from]) ||
            !Number.isFinite(o.work) ||
            o.work < 0 ||
            (!o.water && !PROCESSES[o.recipe]) ||
            (o.water &&
              (!LIQUIDS.includes(o.water.kind) ||
                !Number.isFinite(o.water.amount) ||
                o.water.amount < 0 ||
                o.water.amount > 12)),
        ))
    )
      return null;
    s.log = Array.isArray(s.log)
      ? s.log.filter((t) => typeof t === "string").slice(0, 12)
      : [];
    return s;
  } catch {
    return null;
  }
}
