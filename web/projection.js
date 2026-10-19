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

// Keep logical zoom limits aligned with the minimum visible world scale.
export function zoomLimits(width, height) {
  const base=Math.max(.001,Math.min(width/1900,height/1050));
  return {base,min:Math.min(1.8,Math.max(.18,.18/base)),max:1.8};
}
export function clampZoom(width,height,value) {
  const {min,max}=zoomLimits(width,height);
  return Math.max(min,Math.min(max,Number.isFinite(value)?value:1.3));
}
