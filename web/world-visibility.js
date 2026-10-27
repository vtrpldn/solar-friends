// Includes every calibrated building, crop, lantern halo and work overlay.
// Keep this deliberately wider than the artwork; boundary pixels must remain
// visible in both the world and depth-ordered lighting passes.
export const BUILDING_DRAW_MARGIN = 240;
export function buildingInViewport(point, scale, width, height) {
  const margin = BUILDING_DRAW_MARGIN * scale + 8;
  return point.x >= -margin && point.x <= width + margin &&
    point.y >= -margin && point.y <= height + margin;
}
