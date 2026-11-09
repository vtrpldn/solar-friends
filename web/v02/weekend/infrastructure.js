import {recordMoney} from './finances.js';
import {waterFactor} from './world-settings.js';
import { riverBankAt, riverAccess } from "./river-layout.js";
// v2 port of v1 electricity and water ownership rules. No renderer dependency.
export const GRID_POWER = { capacity: 4, tariff: 1.2 };
export const LIQUIDS = ["fresh", "irrigation", "greywater", "sewage"];
export const POWER_LOAD = {
  'water-pump': .18, shed: .015, kitchen: .025, workshop: .025,
  greenhouse: .02, square: .025, well: .08, warehouse: .02,
  coop: .01, streetlight: .015, eco_toilet: .005, home: .02,
};
export function workingMachine(s,node) {
  return (s.operations||[]).some(o=>o.site===node.id && !o.done && o.phase==='process' &&
    ['Working','Waiting for power'].includes(o.status) && !o.biogas && s.people.some(r=>r.operation===o.id && ['produce','blocked'].includes(r.action) && r.energy>=25 && !r.sleepUntil));
}
// Capability, not instantaneous demand: lights still have a switch in daylight,
// and pumps still have one while their tanks are empty or their pipes disabled.
export function hasPowerService(sys, node) {
  if(node?.kind === "water-storage") return false;
  return !!node && !!(POWER_LOAD[node.kind] || node.battery ||
    ["solar_farm", "hydro", "home", "camp"].includes(node.kind));
}
export function canSwitchBuilding(sys, node) {
  return !!node && node.id > 0 && hasPowerService(sys, node);
}
export function switchBuilding(sys, id) {
  const node = sys.nodes[id];
  if (!canSwitchBuilding(sys, node)) return false;
  node.enabled = !node.enabled;
  return true;
}
const CAPACITY = {
  'groundwater-well':[0,40,0,0],
  'water-pump':[0,12,0,0],
  well: [75, 60, 0, 0],
  "water-storage": [40, 40, 0, 0],
  home: [8, 0, 24, 16],
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
  sys.grid ??= { enabled: true, imported: 0, spent: 0, importing: 0 };
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
      { solar_farm: 36, hydro: 18, home: 0, "supply-6": 36 }[kind] || 0;
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
    const node=sys.nodes[p.id];
    if(kind==='home'){node.solarUpgrade=!!p.solarUpgrade;node.battery=p.solarUpgrade?4:0;node.charge=Math.min(node.charge,node.battery);}
    if(kind==='water-storage' && (node.kind!==kind || node.capacity[1]<40)) {
      // Existing starter tanks become passive without destroying stored water.
      node.kind=kind;node.capacity=[Math.max(40,node.water[0]),Math.max(40,node.water[1]),0,0];
    }
    Object.assign(sys.nodes[p.id], { x: p.x, z: p.z });
    if (kind === "home" && sys.nodes[p.id].capacity[3] === 0) sys.nodes[p.id].capacity = [...CAPACITY.home];
  }
  // Old saves may contain a passive structure disabled by the former blanket
  // switch. Restore its availability now that it no longer has such a control.
  for (const node of Object.values(sys.nodes))
    if (!hasPowerService(sys,node)) node.enabled = true;
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
  sys.grid.importing = 0;
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
        ? { solar_farm: 6 * sun, hydro: 2.34, home: n.solarUpgrade ? 0.6 * sun : 0 }[n.kind] || 0
        : 0;
      const machinery=['kitchen','workshop'].includes(n.kind);
      const pumping=n.kind==='water-pump' && n.water[1]<n.capacity[1]-.01 && (riverBankAt(n.x+.5,n.z+.5,3,s.landSeed) || Object.values(sys.nodes).some(a=>a.kind==='groundwater-well' && a.enabled && a.water[1]>0 && Math.hypot(a.x-n.x,a.z-n.z)<=6));
      const filtering=n.kind==='well' && (n.water[1]>0 || s.rain) && n.water[0]<n.capacity[0]-.01;
      n.demand = !n.enabled ? 0 :
        (pumping || filtering ? POWER_LOAD[n.kind] :
          ['water-pump','well'].includes(n.kind) ? 0 : (sun<.15 ? POWER_LOAD[n.kind]||0 : 0)) +
        (machinery && workingMachine(s,n) ? .45 : 0);
      generation += n.generation;
      if (n.enabled) {
        stored += n.charge;
        capacity += n.battery;
      }
      demand += n.demand;
    }
    const gridConnected = sys.grid.enabled && component.some(n => n.id === 0 && n.enabled);
    let gridAvailable = gridConnected ? GRID_POWER.capacity * hours : 0;
    const generated = generation * hours;
    let remainder = stored + generated,
      used = 0;
    // Keep water services running before workshop equipment when supply is tight.
    const priority = {
      "water-pump": 0,
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
      const shortfall = Math.max(0, need - remainder);
      // Buy only energy that a load can use; never charge batteries from the grid.
      if (n.enabled && shortfall > 0 && shortfall <= gridAvailable + 1e-9 &&
          shortfall * GRID_POWER.tariff <= s.money) {
        const cost = shortfall * GRID_POWER.tariff;
        recordMoney(s,-cost,"electricity","Grid electricity");
        s.money = Math.max(0, s.money - cost);
        sys.grid.imported += shortfall;
        sys.grid.spent += cost;
        sys.grid.importing += hours ? shortfall / hours : 0;
        gridAvailable = Math.max(0, gridAvailable - shortfall);
        remainder += shortfall;
      }
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
    if(n.enabled && n.kind==='groundwater-well') {
      const add=Math.min(n.capacity[1]-n.water[1],8*hours*waterFactor(s.worldSettings?.water));
      n.water[1]+=add;sys.account.waterReceived+=add;
    }
    if(n.enabled && n.kind==='water-pump' && n.power>.99 && n.demand>0) {
      let amount=Math.min(n.capacity[1]-n.water[1],24*hours);
      const source=Object.values(sys.nodes).filter(a=>a.kind==='groundwater-well'&&a.enabled&&Math.hypot(a.x-n.x,a.z-n.z)<=6).sort((a,b)=>Math.hypot(a.x-n.x,a.z-n.z)-Math.hypot(b.x-n.x,b.z-n.z))[0];
      if(source){amount=Math.min(amount,source.water[1]);source.water[1]-=amount;}
      else if(riverBankAt(n.x+.5,n.z+.5,3,s.landSeed))sys.account.waterReceived+=amount;
      else amount=0;
      n.water[1]+=amount;
    }
    // Rain is non-potable until filtered; no sewage or greywater becomes drinking water.
    if (s.rain && ["well", "rain-barrel"].includes(n.kind)) {
      const add = Math.min(n.capacity[1] - n.water[1], 30 * hours * waterFactor(s.worldSettings?.water));
      n.water[1] += add;
      sys.account.waterReceived += add;
    }
    if (n.enabled && n.kind === "well" && n.power > 0.99 && n.demand>0) {
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
  const shares=new Map();
  for(const a of Object.values(sys.nodes))for(let i=0;i<LIQUIDS.length;i++) {
    const count=sys.links.filter(l=>l.from===a.id && l.kind===LIQUIDS[i] && l.enabled && l.work>=l.required && sys.nodes[l.to]?.enabled && sys.nodes[l.to].capacity[i]-sys.nodes[l.to].water[i]>.0001).length;
    shares.set(`${a.id}:${LIQUIDS[i]}`,count ? a.water[i]/count : 0);
  }
  for (const l of sys.links) {
    if (l.kind === "power" || !l.enabled || l.work < l.required) continue;
    const a = sys.nodes[l.from];
    if (a.enabled && sys.nodes[l.to].enabled) {
      // A river is a manual source. Only a placed pump can extract automatically.
      if(a.kind==='river') continue;
      transferWater(sys, l.from, l.to, l.kind, Math.min(24 * hours,shares.get(`${l.from}:${l.kind}`)||0));
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
  if (sys.grid && (typeof sys.grid.enabled !== "boolean" ||
      [sys.grid.imported, sys.grid.spent, sys.grid.importing].some(v => !Number.isFinite(v) || v < 0))) return false;
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
