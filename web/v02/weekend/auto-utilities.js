import { syncInfrastructure, syncedNodeIndex, POWER_LOAD } from "./infrastructure.js";
const signatures = new WeakMap();
// Connections are part of a finished building, not separate construction jobs.
export function autoConnectUtilities(s, defs) {
  const sys = syncInfrastructure(s, defs),
    index = syncedNodeIndex(sys),
    nodes = index.all;
  const previous = signatures.get(sys);
  const unchanged = (node, old) => node.id === old.id && node.kind === old.kind && node.x === old.x && node.z === old.z;
  // The same index means the same nodes as last time, and a wild tree does not move.
  if (previous?.index === index
    ? index.live.every((node,i) => unchanged(node, previous.nodes[index.at[i]]))
    : previous?.nodes.length === nodes.length && nodes.every((node,i) => unchanged(node, previous.nodes[i]))) {
    previous.index = index;
    return sys;
  }
  signatures.set(sys, {index, nodes: nodes.map(({id, kind, x, z}) => ({id, kind, x, z}))});
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
  const pumps=nodes.filter(n=>n.kind==='water-pump');
  const tanks=nodes.filter(n=>n.kind==="water-storage");
  const fresh = suppliers.length || tanks.length ? [...suppliers,...tanks] : [sys.nodes[0]];
  for (const n of nodes) {
    if (n.kind === "well") add("fresh", nearest(n,pumps), n);
    else if(n.kind === "water-storage") {add("fresh",nearest(n,suppliers),n);add("fresh",nearest(n,pumps),n);}
    // The river, wells, pumps, barrels and wetlands give water; nothing is piped back into them.
    else if (n.capacity[0] && !["river","groundwater-well","water-pump","rain-barrel","wetland"].includes(n.kind)) add("fresh", nearest(n, fresh), n);
    if (["garden", "greenhouse", "orchard", "grove", "coffee"].includes(n.kind)) {
      add(
        "fresh",
        nearest(
          n,
          nodes.filter((a) => ["rain-barrel", "wetland"].includes(a.kind)),
        ),
        n,
      );
      add("fresh", nearest(n,pumps), n);
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
      n.id === 0 || n.battery || POWER_LOAD[n.kind] || (n.kind !== "water-storage" && wanted.some((l) => l.from === n.id)),
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
