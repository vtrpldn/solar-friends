// Wild trees are most of a village's projects: a new plot has hundreds of them and a handful
// of anything else. The per-tick loops over projects and utility nodes have nothing to do for a
// tree, so they walk the lists below instead of every project.
//
// What that relies on: a project whose kind is 'wild-tree' is only ever felled (felled,
// felledAt) or taken out of s.projects. It never moves, is never cultivated, stocked with
// animals, upgraded or serviced, and its utility node holds no water, power or switch.
// Give trees any of that and they must leave these shortcuts.
// verify-v02-wild-land.mjs runs villages with the shortcuts on and off and compares the saves.
let shortcuts = true;
export const wildShortcuts = () => shortcuts;
export function setWildShortcuts(on) { shortcuts = !!on; }

export const WILD_KIND = 'wild-tree';

const lands = new WeakMap();
// {all, tended}: tended is s.projects without the wild trees, in the same order. The same object
// comes back until a project is added, removed or replaced, so a caller can tell whether it has
// already seen this land. (A project keeps its key for life; nothing re-keys one in place.)
export function landIndex(s, defs) {
  const all = s.projects;
  if (!shortcuts) return {all, tended: all};
  const known = lands.get(all);
  if (known && known.seen.length === all.length) {
    const {seen} = known;
    let i = 0;
    for (; i < all.length; i++) if (all[i] !== seen[i]) break;
    if (i === all.length) return known;
  }
  const land = {all, seen: [...all], tended: all.filter(p => defs[p.key]?.kind !== WILD_KIND)};
  lands.set(all, land);
  return land;
}
export const tendedProjects = (s, defs) => landIndex(s, defs).tended;

const nodeIndexes = new WeakMap();
// {all, live, at} for a utility system: every node, and those that are not wild trees with their
// positions in `all`. The same object comes back until a node is added, removed or replaced.
export function nodeIndex(sys) {
  const all = Object.values(sys.nodes);
  if (!shortcuts) return {all, live: all, at: all.map((_, i) => i)};
  const known = nodeIndexes.get(sys.nodes);
  if (known && known.all.length === all.length) {
    const old = known.all;
    let i = 0;
    for (; i < all.length; i++) if (all[i] !== old[i]) break;
    if (i === all.length) return known;
  }
  const live = [], at = [];
  all.forEach((n, i) => { if (n.kind !== WILD_KIND) { live.push(n); at.push(i); } });
  const index = {all, live, at};
  nodeIndexes.set(sys.nodes, index);
  return index;
}

// A settled wild tree's node says nothing its project does not, and a new plot has hundreds of
// them: most of a save's size. Saves leave them out and restore puts them back.
const RESTING = {charge: 0, battery: 0, enabled: true, power: 1, serviceFactor: 1, solarKw: 0, generation: 0, demand: 0, connected: false};
const RESTING_KEYS = ['id', 'kind', 'x', 'z', 'capacity', 'water', ...Object.keys(RESTING)];
const empty = list => Array.isArray(list) && list.length === 4 && list.every(n => n === 0);
function restingNode(n, p) {
  if (n.kind !== WILD_KIND || !p || n.x !== p.x || n.z !== p.z || !empty(n.capacity) || !empty(n.water)) return false;
  for (const key in RESTING) if (n[key] !== RESTING[key]) return false;
  return Object.keys(n).length === RESTING_KEYS.length;
}
// s.infrastructure.nodes without the resting wild-tree nodes, for writing a save.
export function savedNodes(s, defs) {
  const trees = new Map();
  for (const p of s.projects) if (defs[p.key]?.kind === WILD_KIND && p.work >= defs[p.key].work) trees.set(p.id, p);
  const nodes = {};
  for (const [id, n] of Object.entries(s.infrastructure.nodes)) if (!restingNode(n, trees.get(n?.id))) nodes[id] = n;
  return nodes;
}
// Puts back the nodes savedNodes left out. Call on a parsed save before anything reads its nodes.
export function restoreWildNodes(s, defs) {
  const nodes = s.infrastructure?.nodes;
  if (!nodes || typeof nodes !== 'object' || !Array.isArray(s.projects)) return;
  for (const p of s.projects) {
    const def = p && defs[p.key];
    if (def?.kind !== WILD_KIND || !(p.work >= def.work) || nodes[p.id]) continue;
    nodes[p.id] = {id: p.id, kind: WILD_KIND, x: p.x, z: p.z, capacity: [0, 0, 0, 0], water: [0, 0, 0, 0], ...RESTING};
  }
}
