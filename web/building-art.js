// Canonical runtime sizes and measured ground-axis slopes for the painted assets.
// Width is the full source-cell width at zoom 1, including transparent padding.
// Axis calibration keeps verticals vertical and maps the two measured ground
// directions to the same +/- 1/2 slopes used by projection.js.
import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from './projection.js';
const atlas = 'village-atlas-isometric.png';
export const buildingArt = {
  home: { name: 'Home', file: atlas, cell: [0, 0, .5, .5], width: 179.36, anchor: .70, axes: [.50, -.50] },
  kitchen: { name: 'Kitchen', file: atlas, cell: [.5, 0, .5, .5], width: 179.36, anchor: .70, axes: [.58, -.58] },
  grove: { name: 'Banana grove', file: atlas, cell: [.5, .5, .5, .5], width: 123.9, anchor: .74 },
  garden: { name: 'Garden', file: 'garden-simple-isometric.png', width: 140.42, anchor: .52, axes: [.55, -.55] },
  well: { name: 'Cistern', file: 'cistern-isometric.png', width: 77, anchor: .82, axes: [.55, -.55] },
  compost: { name: 'Compost station', file: 'compost-isometric.png', width: 78, anchor: .75, axes: [.60, -.60] },
  square: { name: 'Community square', file: 'square-isometric.png', width: 172, anchor: .73, axes: [.50, -.50] },
  workshop: { name: 'Workshop', file: 'workshop-isometric.png', width: 158, anchor: .81, axes: [.52, -.42] },
  coop: { name: 'Chicken coop', file: 'coop-isometric.png', width: 100, anchor: .76, axes: [.55, -.40] },
};
export function cameraCalibration(art) {
  if (!art.axes) return { vertical: 1, shear: 0 };
  const [right, left] = art.axes;
  const slope = TILE_HALF_HEIGHT / TILE_HALF_WIDTH;
  const vertical = 2 * slope / (right - left);
  return { vertical, shear: slope - vertical * right };
}
export function drawBuildingArt(ctx, image, art, x, y, scale = 1, alpha = 1) {
  if (!image?.complete || !image.naturalWidth) return;
  const [cx, cy, cw, ch] = art.cell || [0, 0, 1, 1];
  const w = art.width * scale;
  const { vertical, shear } = cameraCalibration(art);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.transform(1, shear, 0, vertical, 0, 0);
  ctx.drawImage(image, cx * image.naturalWidth, cy * image.naturalHeight,
    cw * image.naturalWidth, ch * image.naturalHeight,
    -w / 2, -w * art.anchor, w, w);
  ctx.restore();
}
