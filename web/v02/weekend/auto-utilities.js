import { syncInfrastructure, POWER_LOAD } from "./infrastructure.js";
const signatures = new WeakMap();
// Connections are part of a finished building, not separate construction jobs.
export function autoConnectUtilities(s, defs) {
  const sys = syncInfrastructure(s, defs),
    nodes = Object.values(sys.nodes);
  const signature = nodes.map((n) => `${n.id}:${n.x}:${n.z}`).join("|");
  if (signatures.get(sys) === signature) return sys;
  signatures.set(sys, signature);
  const wanted = [];
  const add = (kind, a, b) => {
    if (
      a &&
      b &&
      a.id !== b.id &&
      !wanted.some((l) => l.kind === kind && l.from === a.id && l.to === b.id)
    )
      wanted.push({ kind, from: a.id, to: b.id });
  };
  const nearest = (target, list) =>
    list
      .filter((n) => n.id !== target.id)
      .sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.z - target.z) -
            Math.hypot(b.x - target.x, b.z - target.z) || a.id - b.id,
      )[0];
  const suppliers = nodes.filter((n) => n.kind === "well");
  const fresh = suppliers.length ? suppliers : [sys.nodes[0]];
  for (const n of nodes) {
    if (n.kind === "well") add("irrigation", sys.nodes[-1], n);
    else if (n.capacity[0]) add("fresh", nearest(n, fresh), n);
    if (["garden", "greenhouse", "orchard", "grove"].includes(n.kind)) {
      add(
        "irrigation",
        nearest(
          n,
          nodes.filter((a) => ["rain-barrel", "wetland"].includes(a.kind)),
        ),
        n,
      );
      add("irrigation", sys.nodes[-1], n);
    }
    if (n.capacity[2] && n.kind !== "wetland")
      add(
        "greywater",
        n,
        nearest(
          n,
          nodes.filter((a) => a.kind === "wetland"),
        ),
      );
    if (n.capacity[3] && !["biodigester", "banana_treatment"].includes(n.kind))
      add(
        "sewage",
        n,
        nearest(
          n,
          nodes.filter((a) =>
            ["biodigester", "banana_treatment"].includes(a.kind),
          ),
        ),
      );
  }
  // A short spanning network links producers, batteries, loads and water pumps.
  const powered = nodes.filter(
    (n) =>
      n.id === 0 || n.battery || POWER_LOAD[n.kind] || wanted.some((l) => l.from === n.id),
  );
  if (powered.length) {
    const joined = [powered.shift()];
    while (powered.length) {
      let choice;
      for (const a of joined)
        for (const b of powered) {
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (!choice || d < choice.d) choice = { a, b, d };
        }
      add("power", choice.a, choice.b);
      joined.push(choice.b);
      powered.splice(powered.indexOf(choice.b), 1);
    }
  }
  const old = sys.links;
  sys.links = wanted.map((l) => {
    const existing = old.find(
      (o) =>
        o.kind === l.kind &&
        ((o.from === l.from && o.to === l.to) ||
          (l.kind === "power" && o.from === l.to && o.to === l.from)),
    );
    return {
      ...l,
      id: existing?.id ?? sys.nextLink++,
      required: 1,
      work: 1,
      enabled: existing?.enabled ?? true,
      automatic: true,
    };
  });
  return sys;
}
