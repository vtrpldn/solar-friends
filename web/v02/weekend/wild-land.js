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
