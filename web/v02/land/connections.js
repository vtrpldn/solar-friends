import { CELL_METRES } from "./layout.js";
import { footprint } from "./editor.js";
export const CONNECTABLE = new Set(["garden", "solar_farm", "orchard"]);
const key = (x, z) => `${x},${z}`;

// Derive connections from placement records. Never replace the editable sections
// with a bounding rectangle: holes and L-shaped arrangements must stay empty.
export function connections(records) {
  const candidates = records.filter((r) => CONNECTABLE.has(r.asset));
  const occupied = new Map(),
    cells = new Map(),
    overlaps = new Set();
  for (const r of candidates) {
    const [w, d] = footprint(r),
      list = [];
    for (let x = r.column; x < r.column + w; x++)
      for (let z = r.row; z < r.row + d; z++) {
        const k = `${r.asset}:${key(x, z)}`;
        list.push([x, z]);
        if (occupied.has(k)) {
          overlaps.add(r.id);
          for (const old of occupied.get(k)) overlaps.add(old.id);
        }
        if (!occupied.has(k)) occupied.set(k, []);
        occupied.get(k).push(r);
      }
    cells.set(r.id, list);
  }
  const eligible = candidates.filter((r) => !overlaps.has(r.id));
  const owners = new Map();
  for (const r of eligible)
    for (const [x, z] of cells.get(r.id))
      owners.set(`${r.asset}:${key(x, z)}`, r.id);
  const parent = new Map(eligible.map((r) => [r.id, r.id]));
  function root(id) {
    while (parent.get(id) !== id) {
      parent.set(id, parent.get(parent.get(id)));
      id = parent.get(id);
    }
    return id;
  }
  for (const r of eligible)
    for (const [x, z] of cells.get(r.id))
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
      ]) {
        const neighbor = owners.get(`${r.asset}:${key(x + dx, z + dz)}`);
        if (neighbor) parent.set(root(neighbor), root(r.id));
      }
  const groups = new Map();
  for (const r of eligible) {
    const id = root(r.id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(r);
  }
  const result = new Map();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort(
      (a, b) =>
        a.row - b.row || a.column - b.column || a.id.localeCompare(b.id),
    );
    const area = members.reduce((sum, r) => sum + cells.get(r.id).length, 0);
    for (const r of members) {
      const [w, d] = footprint(r),
        angle = (r.rotation * Math.PI) / 180,
        c = Math.round(Math.cos(angle)),
        s = Math.round(Math.sin(angle));
      const local = ([x, z]) => {
        const dx = (x - r.column - w / 2) * CELL_METRES,
          dz = (z - r.row - d / 2) * CELL_METRES;
        return [c * dx - s * dz, s * dx + c * dz];
      };
      const edges = [];
      for (const [x, z] of cells.get(r.id)) {
        const sides = [
          [
            -1,
            0,
            [
              [x, z],
              [x, z + 1],
            ],
          ],
          [
            1,
            0,
            [
              [x + 1, z],
              [x + 1, z + 1],
            ],
          ],
          [
            0,
            -1,
            [
              [x, z],
              [x + 1, z],
            ],
          ],
          [
            0,
            1,
            [
              [x, z + 1],
              [x + 1, z + 1],
            ],
          ],
        ];
        for (const [dx, dz, ends] of sides)
          if (!owners.has(`${r.asset}:${key(x + dx, z + dz)}`))
            edges.push(ends.map(local));
      }
      result.set(r.id, {
        count: members.length,
        area,
        leader: r.id === members[0].id,
        edges,
      });
    }
  }
  return result;
}
