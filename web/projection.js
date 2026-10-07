// All world artwork uses this 2:1 orthographic projection. Horizontal world
// axes rise/fall one screen pixel for every two pixels travelled sideways.
export const TILE_HALF_WIDTH = 34;
export const TILE_HALF_HEIGHT = 17;

export function project(x, y, origin, scale) {
  return {
    x: origin.x + (x - y) * TILE_HALF_WIDTH * scale,
    y: origin.y + (x + y) * TILE_HALF_HEIGHT * scale,
  };
}

export function unproject(x, y, origin, scale) {
  const a = (x - origin.x) / (TILE_HALF_WIDTH * scale);
  const b = (y - origin.y) / (TILE_HALF_HEIGHT * scale);
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}
