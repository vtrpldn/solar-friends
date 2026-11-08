import { accessRoadAt } from "./road-layout.js";
import { ARRIVAL_DURATION, ARRIVAL_SPOTS } from "./arrival.js";
import { riverBankAt } from "./river-layout.js";
// A self-contained v0.2 prototype. Time is measured in active simulation seconds.
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
    z: 27,
    shade: false,
    wet: true,
    description: "Quick unloading. Low ground may collect water when it rains.",
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
    materials: { wood: 8, hardware: 1, tarp: 1 },
    work: 134,
    description:
      "Assemble a table from pre-cut boards and tie up the brought-in tarp. About 1 person-hour of assembly, plus carrying.",
  },
  water: {
    name: "Water storage",
    asset: "well",
    size: [2, 2],
    materials: { wood: 8, hardware: 1, tank: 1, plumbing: 1 },
    work: 267,
    description:
      "Build a level timber stand and install the brought-in tank, tap and pipes. About 2 person-hours, plus carrying; this is not a drilled well.",
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
export function materialText(id, n) {
  return `${n} ${n === 1 ? MATERIALS[id].name.replace(/s$/, "") : MATERIALS[id].name}`;
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
  return Object.entries(PROJECTS[key].materials)
    .filter(([id, n]) => materialCount(s, id) < n)
    .map(([id, n]) => materialText(id, n - materialCount(s, id)));
}
export function requiredLoads(key) {
  return Object.entries(PROJECTS[key].materials).reduce(
    (sum, [id, n]) => sum + Math.ceil(n / MATERIALS[id].batch),
    0,
  );
}
export const NAMES = ["Iara", "Bento", "Luz", "Cauã", "Nina"];
export function createWeekend() {
  return {
    version: 2,
    stage: "arrival",
    arrivalElapsed: 0,
    camp: null,
    time: 0,
    money: 220,
    wood: 36,
    materials: {
      hardware: 7,
      roofing: 8,
      tarp: 1,
      tank: 1,
      plumbing: 1,
      sanitation: 1,
    },
    stock: { x: 32, z: 23 },
    projects: [],
    people: NAMES.map((name, i) => ({
      name,
      id: ["iara", "bento", "luz", "caua", "nina"][i],
      x: ARRIVAL_SPOTS[i][0],
      z: ARRIVAL_SPOTS[i][1],
      energy: 85 + i * 3,
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
export function say(s, text) {
  s.log.unshift(text);
  s.log = s.log.slice(0, 12);
}
export function chooseCamp(s, id) {
  if (s.stage !== "arrival" || s.arrivalElapsed < ARRIVAL_DURATION)
    return false;
  const c = CAMPS.find((c) => c.id === id);
  if (!c) return false;
  s.camp = id;
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
  say(s, `${c.name}: unpack first, then choose what matters most.`);
  return true;
}
export function finished(s, key) {
  return s.projects.some((p) => p.key === key && p.work >= PROJECTS[key].work);
}
export function placementError(s, key, x, z, ignore = null) {
  const def = PROJECTS[key];
  if (!def || !Number.isInteger(x) || !Number.isInteger(z))
    return "Choose a grid square.";
  const [w, d] = def.size;
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++)
      if (accessRoadAt(x + dx, z + dz, 1))
        return "Keep the access road and parking clearing open.";
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++)
      if (riverBankAt(x + dx, z + dz, 1))
        return "Keep projects back from the riverbank.";
  if (x < 21 || z < 21 || x + w > 44 || z + d > 44)
    return "Keep this first camp inside the marked clearing.";
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
        x < p.x + 2 &&
        x + w > p.x &&
        z < p.z + 2 &&
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
      { id: ignore || -1, key, x, z },
    ],
  };
  for (const p of proposed.projects)
    for (const dz of [0, 1])
      if (!route(proposed, s.stock, { x: p.x - 1, z: p.z + dz }))
        return "Leave a walking route along the left edge of every project.";
  return "";
}
export function plan(s, key, x, z) {
  if (s.stage !== "playing") return "Choose your campsite first.";
  const def = PROJECTS[key];
  if (!def) return "Unknown project.";
  if (s.projects.some((p) => p.key === key))
    return "Already planned. Select it to change priority or move it.";
  const error = placementError(s, key, x, z);
  if (error) return error;
  const missing = missingMaterials(s, key);
  if (missing.length)
    return `Missing ${missing.join(", ")}. Buy supplies in town first.`;
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
  for (const [id, n] of Object.entries(def.materials)) {
    if (id === "wood") s.wood -= n;
    else s.materials[id] -= n;
  }
  s.projects.push({ id: s.nextId++, key, x, z, work: 0, delivered: 0 });
  for (const r of s.people) {
    r.walk = [];
    r.target = null;
  }
  say(
    s,
    `${def.name} planned. Materials reserved; friends will bring them over.`,
  );
  return "";
}
export function moveProject(s, id, x, z) {
  const p = s.projects.find((p) => p.id === id);
  if (!p || s.stage !== "playing") return "Cannot move that now.";
  const error = placementError(s, p.key, x, z, id);
  if (error) return error;
  p.x = x;
  p.z = z;
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
  say(
    s,
    "The group will pick up this project next. Current carrying trips finish first.",
  );
}
export function supplyRun(s, material = "wood") {
  const item = MATERIALS[material];
  if (!item || s.stage !== "playing" || s.trip || s.money < item.price)
    return false;
  const r = s.people
    .filter((r) => r.energy > 35 && !r.cargo)
    .sort((a, b) => b.energy - a.energy)[0];
  if (!r) return false;
  s.money -= item.price;
  s.trip = { person: r.id, left: 55, material };
  r.job = null;
  r.target = null;
  r.walk = [];
  r.action = "town";
  say(
    s,
    `${r.name} is driving to town: ${item.quantity} ${item.name} for R$${item.price}. Back in about a minute.`,
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
  const c = CAMPS.find((c) => c.id === s.camp);
  const cells = [
    ...[31, 32, 33, 34].flatMap((x) => [20, 21, 22].map((z) => ({ x, z }))),
    { x: 30, z: 24 },
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
    riverBankAt(x, z, 0.5) ||
    blockedCamp(s).some((c) => c.x === x && c.z === z) ||
    s.projects.some((p) => x >= p.x && x < p.x + 2 && z >= p.z && z < p.z + 2)
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
  const direct = [from];
  for (let i = 0; i < path.length; ) {
    let far = path.length - 1;
    while (far > i && !walkSegmentClear(s, direct.at(-1), path[far])) far--;
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
  const start = [Math.round(from.x), Math.round(from.z)],
    end = [Math.round(to.x), Math.round(to.z)];
  const key = (x, z) => `${x},${z}`;
  if (start[0] === end[0] && start[1] === end[1])
    return walkSegmentClear(s, from, to)
      ? Math.hypot(from.x - to.x, from.z - to.z) > 0.001
        ? [{ x: to.x, z: to.z }]
        : []
      : null;
  const queue = [start],
    parent = new Map([[key(...start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
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
      return naturalPath(s, from, path);
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
        nx < 20 ||
        nx > 45 ||
        nz < 20 ||
        nz > 45 ||
        parent.has(k) ||
        occupied(s, nx, nz)
      )
        continue;
      parent.set(k, key(x, z));
      queue.push([nx, nz]);
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
  const c = CAMPS.find((c) => c.id === s.camp);
  const p = s.projects.find(
    (p) => p.key === "gathering" && finished(s, "gathering"),
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
  const offsets = [
    [-1, 0],
    [-1, 1],
    [0, 2],
    [1, 2],
    [2, 1],
    [2, 0],
    [1, -1],
    [0, -1],
  ];
  return offsets
    .map(([x, z]) => ({ x: p.x + x, z: p.z + z }))
    .find(
      (spot) =>
        !occupied(s, spot.x, spot.z) &&
        !reserved.some((other) => other.x === spot.x && other.z === spot.z) &&
        route(s, r, spot),
    );
}
function availableProject(s, r) {
  return s.projects.find(
    (p) => p.work < PROJECTS[p.key].work && workSpot(s, r, p),
  );
}
function idleActivity(s, r, i) {
  if (r.idleUntil > s.time) {
    if (r.idleGoal && go(s, r, r.idleGoal) && r.action === "stroll")
      r.action = "look";
    r.energy = Math.min(100, r.energy + 0.025);
    return;
  }
  const c = CAMPS.find((c) => c.id === s.camp);
  const cycle = r.idleCycle || 0;
  r.idleCycle = cycle + 1;
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
  return (
    finished(s, "gathering") &&
    s.projects.some((p) => p.key !== "gathering" && finished(s, p.key)) &&
    !s.trip &&
    (!s.rainSeen || s.rainResolved)
  );
}
export function endWeekend(s) {
  if (!canFinish(s) || s.stage !== "playing") return false;
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
  if (s.stage === "arrival") {
    s.arrivalElapsed = Math.min(
      ARRIVAL_DURATION,
      (s.arrivalElapsed ?? ARRIVAL_DURATION) + Math.min(dt, 1),
    );
    return;
  }
  dt = Math.min(dt, 1);
  s.time += dt;
  if (s.trip) {
    s.trip.left -= dt;
    if (s.trip.left <= 0) {
      const r = s.people.find((r) => r.id === s.trip.person);
      r.action = "idle";
      r.x = 32;
      r.z = 24;
      const id = s.trip.material,
        item = MATERIALS[id];
      if (id === "wood") s.wood += item.quantity;
      else s.materials[id] += item.quantity;
      s.trip = null;
      say(s, `${r.name} is back with ${item.quantity} ${item.name}.`);
    }
  }
  if (
    s.stage === "playing" &&
    (s.time >= 150 ||
      s.projects.some(
        (p) => p.key !== "gathering" && p.work >= PROJECTS[p.key].work / 2,
      )) &&
    !s.rainSeen &&
    s.projects.length
  ) {
    s.rainSeen = true;
    s.rainAt = s.time;
    s.rain = true;
    if (s.camp === "entrance") {
      say(
        s,
        "Rain! Water is pooling beside the supplies. Raise them on boards, or move them uphill.",
      );
    } else {
      s.rainResolved = true;
      say(
        s,
        "A short shower passes through. Your campsite drains well; the supplies stay dry.",
      );
    }
  }
  if (s.rainResolved && s.time > (s.rainAt ?? 150) + 35) s.rain = false;
  for (const [i, r] of s.people.entries()) {
    if (r.action === "town") continue;
    // Leisure is interruptible: a newly available task beats finishing a stroll.
    if (
      s.stage === "playing" &&
      !r.job &&
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
    const water = s.projects.find(
      (p) => p.key === "water" && finished(s, "water"),
    );
    if (
      water &&
      (r.action === "wash" || r.work - (r.cleanedAtWork || 0) >= 55)
    ) {
      if (r.action !== "wash") {
        r.job = null;
        r.cargo = false;
        r.target = null;
      }
      r.action = "wash";
      if (go(s, r, { x: water.x - 1, z: water.z + (i % 2) })) {
        r.washTime = (r.washTime || 0) + dt;
        if (r.washTime >= 8) {
          r.washTime = 0;
          r.cleanedAtWork = r.work;
          r.energy = Math.min(100, r.energy + 8);
          r.action = "idle";
        }
      }
      continue;
    }
    if (
      r.energy < 25 ||
      (r.action === "rest" &&
        r.energy <
          (s.projects.some((p) => p.work < PROJECTS[p.key].work) ? 60 : 80))
    ) {
      r.action = "rest";
      r.job = null;
      r.workSpot = null;
      r.cargo = false;
      if (go(s, r, restSpot(s, i))) {
        const shade =
          CAMPS.find((c) => c.id === s.camp).shade ||
          finished(s, "gathering") ||
          s.projects.some(
            (p) => p.key === "shelter" && p.work >= PROJECTS.shelter.work / 2,
          );
        r.energy = Math.min(100, r.energy + dt * (shade ? 1.4 : 0.65));
      }
      continue;
    }
    let p = s.projects.find(
      (p) => p.id === r.job && p.work < PROJECTS[p.key].work,
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
      idleActivity(s, r, i);
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
    const inTransit = s.people.filter(
      (other) => other.job === p.id && other.cargo,
    ).length;
    if (p.delivered + inTransit < loads && !r.cargo) {
      r.action = "collect";
      if (!r.supplyGoal) r.supplyGoal = supplySpot(s, r, i);
      if (go(s, r, r.supplyGoal)) {
        r.supplyGoal = null;
        r.cargo = true;
        r.target = null;
      }
      continue;
    }
    r.action = r.cargo ? "carry" : "walk";
    if (!go(s, r, dest)) continue;
    if (r.cargo) {
      p.delivered++;
      r.cargo = false;
    }
    if (p.delivered < loads) continue;
    r.action = "build";
    const skilled =
      (r.id === "bento" && p.key === "shelter") ||
      (r.id === "luz" && p.key === "gathering") ||
      (r.id === "caua" && p.key === "water") ||
      (r.id === "nina" && p.key === "toilet");
    const before = p.work;
    p.work = Math.min(PROJECTS[p.key].work, p.work + dt * (skilled ? 1.25 : 1));
    r.work += dt;
    r.energy = Math.max(0, r.energy - dt * 0.16);
    if (before < PROJECTS[p.key].work && p.work >= PROJECTS[p.key].work) {
      say(
        s,
        `${PROJECTS[p.key].name} is ready. ${p.key === "gathering" ? "Somewhere to sit together at last." : p.key === "shelter" ? "A roof for our first night." : p.key === "water" ? "Water close at hand." : "A little privacy goes a long way."}`,
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
      s.projects.length > 4
    )
      return null;
    const fresh = createWeekend();
    s.arrivalElapsed ??= ARRIVAL_DURATION;
    if (
      !Number.isFinite(s.arrivalElapsed) ||
      s.arrivalElapsed < 0 ||
      s.arrivalElapsed > ARRIVAL_DURATION
    )
      return null;
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
    if (s.stage !== "arrival" && !CAMPS.some((c) => c.id === s.camp))
      return null;
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
      s.stock.x < 20 ||
      s.stock.x > 45 ||
      s.stock.z < 20 ||
      s.stock.z > 45
    )
      return null;
    const ids = new Set(),
      keys = new Set();
    for (const p of s.projects) {
      if (
        !PROJECTS[p.key] ||
        keys.has(p.key) ||
        ids.has(p.id) ||
        !Number.isInteger(p.id) ||
        p.id < 1 ||
        !Number.isFinite(p.work) ||
        p.work < 0 ||
        p.work > PROJECTS[p.key].work ||
        !Number.isInteger(p.delivered) ||
        p.delivered < 0 ||
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
        )
      )
        return null;
    }
    for (let i = 0; i < 5; i++) {
      const r = s.people[i];
      if (
        r.id !== fresh.people[i].id ||
        !["x", "z", "energy", "work"].every((k) => Number.isFinite(r[k])) ||
        r.x < 19 ||
        r.x > 46 ||
        r.z < 19 ||
        r.z > 46 ||
        r.energy < 0 ||
        r.energy > 100
      )
        return null;
      if (r.work < 0) return null;
      for (const k of ["washTime", "cleanedAtWork"])
        if (r[k] !== undefined && (!Number.isFinite(r[k]) || r[k] < 0))
          return null;
      r.idleUntil = 0;
      r.idleGoal = null;
      r.lookAt = null;
      r.supplyGoal = null;
      r.target = null;
      r.walk = [];
      r.job = null;
      r.workSpot = null;
      r.cargo = false;
      r.action = s.trip?.person === r.id ? "town" : "idle";
      r.name = fresh.people[i].name;
    }
    if (
      s.trip &&
      (!Object.hasOwn(MATERIALS, s.trip.material) ||
        !s.people.some((r) => r.id === s.trip.person) ||
        !Number.isFinite(s.trip.left) ||
        s.trip.left <= 0 ||
        s.trip.left > 55)
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
