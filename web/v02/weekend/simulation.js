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
export const PROJECTS = {
  gathering: {
    name: "Gathering place",
    asset: "picnic-table",
    size: [2, 2],
    wood: 4,
    cost: 0,
    work: 85,
    description:
      "Unpack the tarp and assemble a table. Shade, meals and a place to recover together.",
  },
  water: {
    name: "Water storage",
    asset: "well",
    size: [2, 2],
    wood: 3,
    cost: 70,
    work: 150,
    description:
      "Fit a purchased tank and fill it from your brought-in supply. Friends can wash and refresh themselves between jobs.",
  },
  shelter: {
    name: "Basic shelter",
    asset: "shed",
    size: [2, 2],
    wood: 10,
    cost: 50,
    work: 220,
    description:
      "A dry roof for the group. The frame gives shade halfway through construction.",
  },
  toilet: {
    name: "Private toilet",
    asset: "eco_toilet",
    size: [2, 2],
    wood: 6,
    cost: 40,
    work: 160,
    description:
      "Assemble a private temporary toilet. Makes an overnight stay more comfortable.",
  },
};
export const NAMES = ["Iara", "Bento", "Luz", "Cauã", "Nina"];
export function createWeekend() {
  return {
    version: 1,
    stage: "arrival",
    camp: null,
    time: 0,
    money: 220,
    wood: 18,
    stock: { x: 32, z: 23 },
    projects: [],
    people: NAMES.map((name, i) => ({
      name,
      id: ["iara", "bento", "luz", "caua", "nina"][i],
      x: 30 + i * 0.6,
      z: 24,
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
  if (s.stage !== "arrival") return false;
  const c = CAMPS.find((c) => c.id === id);
  if (!c) return false;
  s.camp = id;
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
  if (s.wood < def.wood || s.money < def.cost)
    return "Not enough supplies. Bring timber from town or choose a smaller project.";
  for (const r of s.people)
    if (["relax", "idle"].includes(r.action)) {
      r.walk = [];
      r.target = null;
    }
  s.wood -= def.wood;
  s.money -= def.cost;
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
export function supplyRun(s) {
  if (s.stage !== "playing" || s.trip || s.money < 45) return false;
  const r = s.people
    .filter((r) => r.energy > 35 && !r.cargo)
    .sort((a, b) => b.energy - a.energy)[0];
  if (!r) return false;
  s.money -= 45;
  s.trip = { person: r.id, left: 55 };
  r.job = null;
  r.target = null;
  r.walk = [];
  r.action = "town";
  say(
    s,
    `${r.name} is driving to town: 12 timber for R$45. Back in about a minute.`,
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
    { x: 32, z: 21 },
    { x: 32, z: 22 },
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
    blockedCamp(s).some((c) => c.x === x && c.z === z) ||
    s.projects.some((p) => x >= p.x && x < p.x + 2 && z >= p.z && z < p.z + 2)
  );
}
// Four-neighbour paths keep people outside project footprints, including unfinished ones.
export function route(s, from, to) {
  const start = [Math.round(from.x), Math.round(from.z)],
    end = [Math.round(to.x), Math.round(to.z)];
  const key = (x, z) => `${x},${z}`;
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
      return path;
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
    if (!occupied(s, target.x, target.z) && route(s, s.people[i], target)) {
      cache.spots[i] = target;
      return target;
    }
  }
  return { x: 31, z: 24 };
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
  if (s.stage === "arrival" || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 1);
  s.time += dt;
  if (s.trip) {
    s.trip.left -= dt;
    if (s.trip.left <= 0) {
      const r = s.people.find((r) => r.id === s.trip.person);
      r.action = "idle";
      r.x = 32;
      r.z = 24;
      s.wood += 12;
      s.trip = null;
      say(s, `${r.name} is back with 12 timber.`);
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
    if (r.walk.length) {
      const next = r.walk[0],
        dx = next.x - r.x,
        dz = next.z - r.z,
        d = Math.hypot(dx, dz),
        step = dt * (r.cargo ? 0.72 : 0.95);
      if (d <= step) {
        r.x = next.x;
        r.z = next.z;
        r.walk.shift();
      } else {
        r.x += (dx / d) * step;
        r.z += (dz / d) * step;
      }
      r.energy = Math.max(0, r.energy - dt * 0.025);
      continue;
    }
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
    if (r.energy < 25 || (r.action === "rest" && r.energy < 80)) {
      r.action = "rest";
      r.job = null;
      r.cargo = false;
      if (go(s, r, restSpot(s, i))) {
        const shade =
          CAMPS.find((c) => c.id === s.camp).shade ||
          finished(s, "gathering") ||
          s.projects.some((p) => p.key === "shelter" && p.work >= 110);
        r.energy = Math.min(100, r.energy + dt * (shade ? 1.4 : 0.65));
      }
      continue;
    }
    let p = s.projects.find(
      (p) => p.id === r.job && p.work < PROJECTS[p.key].work,
    );
    if (!p) {
      r.job = null;
      r.cargo = false;
      p = s.projects.find(
        (p) =>
          p.work < PROJECTS[p.key].work &&
          s.people.filter((other) => other.job === p.id).length < 2,
      );
      if (p) {
        r.job = p.id;
        r.target = null;
      }
    }
    if (!p) {
      r.action = "relax";
      go(s, r, restSpot(s, i));
      r.energy = Math.min(100, r.energy + dt * 0.25);
      continue;
    }
    const slot = s.people
      .filter((other) => other.job === p.id)
      .findIndex((other) => other === r);
    const dest = { x: p.x - 1, z: p.z + Math.max(0, slot) };
    if (p.delivered < 2 && !r.cargo) {
      r.action = "collect";
      if (go(s, r, s.stock)) {
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
    if (p.delivered < 2) continue;
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
      s.version !== 1 ||
      !["arrival", "playing", "evening"].includes(s.stage) ||
      !Array.isArray(s.people) ||
      s.people.length !== 5 ||
      !Array.isArray(s.projects) ||
      s.projects.length > 4
    )
      return null;
    const fresh = createWeekend();
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
        p.delivered > 5
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
      r.target = null;
      r.walk = [];
      r.job = null;
      r.cargo = false;
      r.action = s.trip?.person === r.id ? "town" : "idle";
      r.name = fresh.people[i].name;
    }
    if (
      s.trip &&
      (!s.people.some((r) => r.id === s.trip.person) ||
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
