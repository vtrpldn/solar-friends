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
  greenhouse: { name: 'Greenhouse', file: 'greenhouse-isometric.png', width: 188, anchor: .66, axes: [.55, -.50] },
  well: { name: 'Cistern', file: 'cistern-isometric.png', width: 77, anchor: .82, axes: [.55, -.55] },
  compost: { name: 'Compost station', file: 'compost-isometric.png', width: 78, anchor: .75, axes: [.60, -.60] },
  square: { name: 'Community square', file: 'square-isometric.png', width: 172, anchor: .73, axes: [.50, -.50] },
  workshop: { name: 'Workshop', file: 'workshop-isometric.png', width: 158, anchor: .81, axes: [.52, -.42] },
  coop: { name: 'Chicken coop', file: 'coop-isometric.png', width: 100, anchor: .76, axes: [.55, -.40] },
};
// Visual variants share the home simulation kind, cost, beds and footprint.
export const homeVariants = {
  'home-veranda': { name:'Home · veranda', file:'home-veranda.png', width:158, anchor:.70, axes:[.50,-.50] },
  'home-gable': { name:'Home · gable', file:'home-gable.png', width:164, anchor:.68, axes:[.50,-.50] },
  'home-courtyard': { name:'Home · entry terrace', file:'home-courtyard.png', width:156, anchor:.70, axes:[.50,-.50] },
};
export const allBuildingArt = {...buildingArt,...homeVariants};
export const homeArtKeys = ['home', ...Object.keys(homeVariants)];
export function buildingArtKey(building, buildings) {
  if(building.kind!=='home')return building.kind;
  // IDs survive save/reload and unrelated building additions. The placement
  // ghost has no ID and uses the next house's place in the same sequence.
  const ordinal=buildings.filter(b=>b.kind==='home' && (building.id==null || b.id<building.id)).length;
  return homeArtKeys[ordinal%homeArtKeys.length];
}
// Night variants share the original crop, camera, scale and ground anchor.
for (const art of Object.values(allBuildingArt)) art.nightFile = art.file.replace('.png', '-night.png');
export function nightAmount(minutes) {
  const hour = (((minutes % 1440) + 1440) % 1440) / 60;
  const altitude = Math.sin(((hour - 6) / 12) * Math.PI);
  return Math.max(0, Math.min(1, (0.18 - altitude) / 0.65));
}
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
