export const MAP_CELLS = 64;
export const CELL_METRES = 2;
export const MAP_METRES = MAP_CELLS * CELL_METRES;
// Cells are zero-based; even-sized props sit on cell intersections.
export function placementPosition(column, row, footprint) {
  return [
    (column + footprint[0] / 2 - MAP_CELLS / 2) * CELL_METRES,
    0,
    (row + footprint[1] / 2 - MAP_CELLS / 2) * CELL_METRES,
  ];
}
export function worldCell(x, z) {
  const column = Math.floor(x / CELL_METRES + MAP_CELLS / 2);
  const row = Math.floor(z / CELL_METRES + MAP_CELLS / 2);
  return column >= 0 && column < MAP_CELLS && row >= 0 && row < MAP_CELLS
    ? { column, row }
    : null;
}
export const PLACEMENTS = [
  {
    id: "home",
    asset: "house",
    column: 30,
    row: 29,
    rotation: 0,
    label: "Limewashed house",
  },
  {
    id: "shelter",
    asset: "shed",
    column: 34,
    row: 30,
    rotation: 0,
    label: "Open timber shed",
  },
  {
    id: "shade",
    asset: "tree",
    column: 29,
    row: 34,
    rotation: 0,
    label: "Shade tree",
  },
  {
    id: "friend",
    asset: "resident",
    column: 32,
    row: 33,
    rotation: 0,
    label: "Resident scale study",
  },
  ...[
    ...[30, 31, 32, 33, 34, 35].map((column) => [column, 31]),
    ...[32, 33, 34, 35].map((row) => [32, row]),
  ].map(([column, row], i) => ({
    id: `path-${i}`,
    asset: "road",
    column,
    row,
    rotation: 0,
    label: "Earth path",
  })),
];

export function cameraOffset(bearing) {
  const angle = Math.PI / 4 + (bearing * Math.PI) / 2;
  return [Math.cos(angle) * 120, 120 / Math.sqrt(3), Math.sin(angle) * 120];
}
