export const MAP_CELLS = 96;
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
    column: 43,
    row: 43,
    rotation: 0,
    label: "Limewashed house",
  },
  {
    id: "shelter",
    asset: "shed",
    column: 51,
    row: 45,
    rotation: 0,
    label: "Open timber shed",
  },
  {
    id: "shade",
    asset: "tree",
    column: 42,
    row: 51,
    rotation: 0,
    label: "Shade tree",
  },
  {
    id: "friend",
    asset: "resident",
    column: 48,
    row: 49,
    rotation: 0,
    label: "Resident scale study",
  },
  ...[
    ...[43,44,45,46,47,48,49,50,51,52,53,54].map((column) => [column,49]),
    ...[50,51,52,53,54].map((row) => [48,row]),
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
