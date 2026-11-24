// The first camp's shape, in one place. A camp is anchored on a grid cell and
// laid out in local cells: columns -1..3 across, rows -3..-1 under canvas and
// row 0 as the open apron in front of the tent doors. `rotation` turns that
// layout in quarter turns about the anchor; saves without it face rotation 0.
export const CAMP_LOADS = [
  { id: "tent-a", name: "the first tent", car: 0 },
  { id: "tent-b", name: "the second tent", car: 1 },
  { id: "bedrolls", name: "the bedrolls", car: 0 },
  { id: "cooler", name: "the cooler", car: 1 },
  { id: "water", name: "the water jugs", car: 0 },
  { id: "kitchen", name: "the camp kitchen box", car: 1 },
  { id: "chairs", name: "the folding chairs", car: 0 },
  { id: "line", name: "the lantern and washing line", car: 1 },
];
export const campRotation = (c) => c?.rotation || 0;
export function campPoint(c, lx, lz) {
  const [dx, dz] = [
    [lx, lz],
    [-lz, lx],
    [-lx, -lz],
    [lz, -lx],
  ][campRotation(c)];
  return { x: c.x + dx, z: c.z + dz };
}
// Whole levelled site, including the apron: {x, z, w, d} in cells.
export function campRect(c) {
  const a = campPoint(c, -1, -3),
    b = campPoint(c, 3, 0);
  const x = Math.min(a.x, b.x),
    z = Math.min(a.z, b.z);
  return { x, z, w: Math.abs(a.x - b.x) + 1, d: Math.abs(a.z - b.z) + 1 };
}
// Cells under tents and gear; nobody walks or builds here.
export function campCells(c) {
  const cells = [];
  for (let lx = -1; lx <= 3; lx++)
    for (let lz = -3; lz < 0; lz++) cells.push(campPoint(c, lx, lz));
  return cells;
}
export function campSiteCells(c) {
  const cells = campCells(c);
  for (let lx = -1; lx <= 3; lx++) cells.push(campPoint(c, lx, 0));
  return cells;
}
export const campDoor = (c, i) => campPoint(c, (i % 2) * 1.5, 0);
// Where the path from the cars meets the camp, one step outside the apron.
export const campApproach = (c) => campPoint(c, 0, 1);
// Each load is set down on its own stretch of the apron.
export const campDropSpot = (c, load) => campPoint(c, [0, 2, 1, 3, -1][load % 5], 0);
export function campEdges(c) {
  const edges = [];
  for (let lx = -1; lx <= 3; lx++)
    edges.push(campPoint(c, lx, -4), campPoint(c, lx, 0));
  for (let lz = -3; lz < 0; lz++)
    edges.push(campPoint(c, -2, lz), campPoint(c, 4, lz));
  return edges;
}
// Radians for a model or walker facing out of the tent doors.
export const campFacing = (c) => (-campRotation(c) * Math.PI) / 2;
