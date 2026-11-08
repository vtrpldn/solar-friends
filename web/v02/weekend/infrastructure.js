import { riverAccess } from "./river-layout.js";
// v2 port of v1 electricity and water ownership rules. No renderer dependency.
export const LIQUIDS = ["fresh", "irrigation", "greywater", "sewage"];
export const POWER_LOAD = {
  shed: 0.1,
  kitchen: 0.6,
  workshop: 0.6,
  greenhouse: 0.5,
  square: 0.4,
  well: 0.2,
  warehouse: 0.2,
  coop: 0.1,
  streetlight: 0.1,
  eco_toilet: 0.1,
  home: 0.2,
};
const CAPACITY = {
  well: [75, 60, 0, 0],
  home: [8, 0, 24, 0],
  kitchen: [6, 0, 24, 0],
  eco_toilet: [8, 0, 16, 16],
  garden: [4, 12, 0, 0],
  greenhouse: [4, 12, 0, 0],
  orchard: [4, 12, 0, 0],
  grove: [4, 12, 0, 0],
  goat_pasture: [6, 0, 0, 0],
  coop: [6, 0, 0, 0],
  wetland: [0, 60, 24, 0],
  biodigester: [0, 0, 0, 24],
  banana_treatment: [0, 0, 0, 40],
  "rain-barrel": [0, 60, 0, 0],
  "wash-station": [8, 0, 24, 0],
};
export function ensureInfrastructure(s) {
  s.infrastructure ??= {
    nodes: {},
    links: [],
    nextLink: 1,
    account: {
      generated: 0,
      consumed: 0,
      curtailed: 0,
      waterReceived: 40,
      waterUsed: 0,
      waterLost: 0,
    },
    biogas: 0,
  };
  const sys = s.infrastructure;
  sys.nodes[0] ??= {
    id: 0,
    kind: "camp",
    x: s.stock.x,
    z: s.stock.z,
    capacity: [40, 60, 120, 80],
    water: [40, 0, 0, 0],
    charge: 0,
    battery: 0,
    enabled: true,
    power: 0,
  };
  sys.nodes[-1] ??= {
    id: -1,
    kind: "river",
    x: 22,
    z: 32,
    capacity: [0, 12, 0, 0],
    water: [0, 0, 0, 0],
    charge: 0,
    battery: 0,
    enabled: true,
    power: 0,
  };
  if (s.landSeed) Object.assign(sys.nodes[-1], riverAccess(s.landSeed));
  sys.nodes[0].x = s.stock.x;
  sys.nodes[0].z = s.stock.z;
  return sys;
}
export function syncInfrastructure(s, defs) {
  const sys = ensureInfrastructure(s);
  for (const p of s.projects) {
    if (p.work < defs[p.key].work) continue;
    const kind = defs[p.key].kind || p.key;
    const battery =
      { solar_farm: 36, hydro: 18, home: 4, "supply-6": 36 }[kind] || 0;
    sys.nodes[p.id] ??= {
      id: p.id,
      kind,
      x: p.x,
      z: p.z,
      capacity: CAPACITY[kind] || [0, 0, 0, 0],
      water: [0, 0, 0, 0],
      charge: 0,
      battery,
      enabled: true,
      power: 0,
    };
    Object.assign(sys.nodes[p.id], { x: p.x, z: p.z });
  }
  return sys;
}
export function connect(s, defs, kind, from, to) {
  const sys = syncInfrastructure(s, defs),
    a = sys.nodes[from],
    b = sys.nodes[to];
  if (!a || !b || from === to)
    return "Choose two different completed buildings.";
  if (!["power", ...LIQUIDS].includes(kind)) return "Unknown connection type.";
  if (
    sys.links.some(
      (l) =>
        l.kind === kind &&
        ((l.from === from && l.to === to) ||
          (kind === "power" && l.from === to && l.to === from)),
    )
  )
    return "Already connected or planned.";
  const index = LIQUIDS.indexOf(kind);
  if (index >= 0 && (!a.capacity[index] || !b.capacity[index]))
    return "Both ends need storage for this water class.";

  const distance = Math.hypot(a.x - b.x, a.z - b.z),
    units = Math.max(1, Math.ceil(distance / 4));
  const recipe =
    kind === "power" ? { electrical: units } : { plumbing: units, pumps: 1 };
  for (const [id, n] of Object.entries(recipe))
    if ((s.materials[id] || 0) < n)
      return `Need ${n} ${id} for this connection.`;
  for (const [id, n] of Object.entries(recipe)) s.materials[id] -= n;
  sys.links.push({
    id: sys.nextLink++,
    from,
    to,
    kind,
    work: 0,
    required: 20 + distance * 3,
    enabled: true,
  });
  return "";
}
export function transferWater(sys, from, to, kind, amount) {
  const a = sys.nodes[from],
    b = sys.nodes[to],
    i = LIQUIDS.indexOf(kind);
  if (!a || !b || i < 0) return 0;
  const n = Math.max(
    0,
    Math.min(amount, a.water[i], b.capacity[i] - b.water[i]),
  );
  a.water[i] -= n;
  b.water[i] += n;
  return n;
}
export function useWater(s, node, amount, irrigation = false) {
  const sys = ensureInfrastructure(s),
    n = sys.nodes[node];
  if (!n) return false;
  const drinking = ["coop", "goat_pasture"].includes(n.kind);
  const i = irrigation && !drinking && n.water[1] >= amount ? 1 : 0;
  if (n.water[i] + 1e-8 < amount) return false;
  if (!irrigation && !drinking && n.capacity[2] - n.water[2] < amount * 0.8)
    return false;
  n.water[i] -= amount;
  if (irrigation || drinking) sys.account.waterUsed += amount;
  else {
    n.water[2] += amount * 0.8;
    sys.account.waterUsed += amount * 0.2;
  }
  return true;
}
export function infrastructureStep(s, defs, dt) {
  const sys = syncInfrastructure(s, defs),
    hours = (dt * 0.45) / 60;
  const sun = Math.max(
    0,
    Math.sin(((((9 + (s.time * 0.45) / 60) % 24) - 6) * Math.PI) / 12),
  );
  const nodes = Object.values(sys.nodes),
    visited = new Set();
  for (const root of nodes) {
    if (visited.has(root.id)) continue;
    const component = [],
      queue = [root];
    visited.add(root.id);
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i];
      component.push(n);
      for (const l of sys.links) {
        if (l.kind !== "power" || !l.enabled || l.work < l.required) continue;
        const peer = l.from === n.id ? l.to : l.to === n.id ? l.from : null;
        if (peer !== null && !visited.has(peer) && sys.nodes[peer]) {
          visited.add(peer);
          queue.push(sys.nodes[peer]);
        }
      }
    }
    let generation = 0,
      stored = 0,
      capacity = 0,
      demand = 0;
    for (const n of component) {
      n.generation = n.enabled
        ? { solar_farm: 6 * sun, hydro: 2.34, home: 0.6 * sun }[n.kind] || 0
        : 0;
      n.demand = n.enabled
        ? (POWER_LOAD[n.kind] || 0) *
            (n.kind === "streetlight" && sun > 0.2 ? 0 : 1) +
          (s.operations || []).filter(
            (o) =>
              o.site === n.id &&
              !o.done &&
              o.recipe &&
              o.phase !== "return" &&
              ["workshop", "kitchen"].includes(n.kind),
          ).length *
            1.2 +
          sys.links.filter(
            (l) =>
              l.from === n.id &&
              l.kind !== "power" &&
              l.enabled &&
              l.work >= l.required &&
              (n.kind === "river" || n.water[LIQUIDS.indexOf(l.kind)] > 0) &&
              sys.nodes[l.to].capacity[LIQUIDS.indexOf(l.kind)] -
                sys.nodes[l.to].water[LIQUIDS.indexOf(l.kind)] >
                0.001,
          ).length *
            0.4
        : 0;
      generation += n.generation;
      if (n.enabled) {
        stored += n.charge;
        capacity += n.battery;
      }
      demand += n.demand;
    }
    const generated = generation * hours;
    let remainder = stored + generated,
      used = 0;
    // Keep water services running before workshop equipment when supply is tight.
    const priority = {
      river: 0,
      well: 0,
      camp: 0,
      eco_toilet: 1,
      home: 2,
      streetlight: 3,
      kitchen: 4,
      workshop: 5,
    };
    const demandOrder = [...component].sort(
      (a, b) =>
        (priority[a.kind] ?? 6) - (priority[b.kind] ?? 6) || a.id - b.id,
    );
    for (const n of demandOrder) {
      const need = n.demand * hours;
      n.power = n.enabled && remainder + 1e-9 >= need ? 1 : 0;
      if (n.power) {
        remainder -= need;
        used += need;
      }
    }
    remainder = Math.max(0, remainder);
    sys.account.generated += generated;
    sys.account.consumed += used;
    sys.account.curtailed += Math.max(0, remainder - capacity);
    remainder = Math.min(capacity, remainder);
    for (const n of component) {
      if (n.enabled)
        n.charge = capacity ? (remainder * n.battery) / capacity : 0;
      n.connected = component.length > 1;
    }
  }
  for (const n of Object.values(sys.nodes)) {
    // Rain is non-potable until filtered; no sewage or greywater becomes drinking water.
    if (s.rain && ["well", "rain-barrel"].includes(n.kind)) {
      const add = Math.min(n.capacity[1] - n.water[1], 30 * hours);
      n.water[1] += add;
      sys.account.waterReceived += add;
    }
    if (n.enabled && n.kind === "well" && n.power > 0.99) {
      const amount = Math.min(
        n.water[1],
        n.capacity[0] - n.water[0],
        25 * hours,
      );
      n.water[1] -= amount;
      n.water[0] += amount;
    }
    if (n.enabled && n.kind === "wetland") {
      const amount = Math.min(
        n.water[2],
        (n.capacity[1] - n.water[1]) / 0.85,
        10 * hours,
      );
      n.water[2] -= amount;
      n.water[1] += amount * 0.85;
      sys.account.waterLost += amount * 0.15;
    }
    if (n.enabled && ["banana_treatment", "biodigester"].includes(n.kind)) {
      const amount = Math.min(n.water[3], 8 * hours);
      n.water[3] -= amount;
      sys.account.waterLost += amount;
      if (n.kind === "biodigester") sys.biogas += amount * 0.15;
    }
  }
  for (const l of sys.links) {
    if (l.kind === "power" || !l.enabled || l.work < l.required) continue;
    const a = sys.nodes[l.from];
    if (a.enabled && sys.nodes[l.to].enabled && a.power > 0.99) {
      if (a.kind === "river" && l.kind === "irrigation") {
        const target = sys.nodes[l.to],
          amount = Math.min(24 * hours, target.capacity[1] - target.water[1]);
        a.water[1] += amount;
        sys.account.waterReceived += amount;
      }
      transferWater(sys, l.from, l.to, l.kind, 24 * hours);
    }
  }
  // Drinking and washing at camp: preserve wastewater instead of silently deleting it.
  const camp = sys.nodes[0],
    drink = Math.min(camp.water[0], s.people.length * 0.6 * hours);
  camp.water[0] -= drink;
  sys.account.waterUsed += drink;
  sys.thirst = drink + 1e-8 < s.people.length * 0.6 * hours;
  const toilets = nodes.filter((n) => n.enabled && n.kind === "eco_toilet");
  sys.sanitationBlocked =
    toilets.length > 0 &&
    toilets.every((n) => n.capacity[3] - n.water[3] < 1.5);
  sys.sun = sun;
}
export function validInfrastructure(s) {
  const sys = s.infrastructure;
  if (!sys) return true;
  if (
    !sys.nodes ||
    !Array.isArray(sys.links) ||
    !sys.account ||
    !Number.isInteger(sys.nextLink) ||
    sys.nextLink < 1 ||
    !Number.isFinite(sys.biogas) ||
    sys.biogas < 0
  )
    return false;
  if (Object.values(sys.account).some((v) => !Number.isFinite(v) || v < 0))
    return false;
  for (const n of Object.values(sys.nodes))
    if (
      ![n.x, n.z, n.charge, n.battery].every(Number.isFinite) ||
      n.charge < 0 ||
      n.charge > n.battery + 1e-6 ||
      n.water?.length !== 4 ||
      n.capacity?.length !== 4 ||
      n.water.some(
        (v, i) =>
          !Number.isFinite(v) ||
          v < 0 ||
          !Number.isFinite(n.capacity[i]) ||
          v > n.capacity[i] + 1e-6,
      )
    )
      return false;
  const ids = new Set();
  for (const l of sys.links) {
    if (
      !sys.nodes[l.from] ||
      !sys.nodes[l.to] ||
      ids.has(l.id) ||
      !["power", ...LIQUIDS].includes(l.kind) ||
      !Number.isFinite(l.work) ||
      !Number.isFinite(l.required) ||
      l.work < 0 ||
      l.required <= 0 ||
      l.work > l.required ||
      l.id >= sys.nextLink
    )
      return false;
    ids.add(l.id);
  }
  return true;
}
