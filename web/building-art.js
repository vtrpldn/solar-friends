// Canonical runtime sizes and measured ground-axis slopes for the painted assets.
// Width is the full source-cell width at zoom 1, including transparent padding.
// Axis calibration keeps verticals vertical and maps the two measured ground
// directions to the same +/- 1/2 slopes used by projection.js.
import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from './projection.js';
import { measuredAxes } from './building-projection.js';
import { buildingTexture } from './building-mesh.js';
const atlas = 'village-atlas-isometric.png';
export const buildingArt = {
  hydro: { name:'River generator', file:'hydro.png', width:96, anchor:.75 },
  eco_toilet: { name:'Ecological toilet', file:'eco-toilet.png', width:100, anchor:.88 },
  wetland: { name:'Reed bed', file:'wetland.png', width:162, anchor:.72, aspect:.5 },
  biodigester: { name:'Biodigester', file:'biodigester.png', width:150, anchor:.71 },
  warehouse: { name:'Storage house', file:'warehouse.png', width:178, anchor:.78 },
  solar_farm: { name: 'Solar farm', file: 'solar-farm.png', width: 188, anchor: .60 },
  streetlight: { name: 'Street light', file: 'streetlight.png', width: 80, anchor: .86 },
  home: { name: 'Home', file: atlas, cell: [0, 0, .5, .5], width: 179.36, anchor: .70 },
  kitchen: { name: 'Kitchen', file: atlas, cell: [.5, 0, .5, .5], width: 179.36, anchor: .70 },
  grove: { name: 'Banana grove', file: atlas, cell: [.5, .5, .5, .5], width: 123.9, anchor: .74 },
  garden: { name: 'Garden', file: 'garden-simple-isometric.png', width: 140.42, anchor: .52 },
  greenhouse: { name: 'Greenhouse', file: 'greenhouse-isometric.png', width: 174, anchor: .76 },
  well: { name: 'Cistern', file: 'cistern-isometric.png', width: 77, anchor: .82 },
  compost: { name: 'Compost station', file: 'compost-isometric.png', width: 78, anchor: .75 },
  square: { name: 'Community square', file: 'square-isometric.png', width: 172, anchor: .73 },
  workshop: { name: 'Workshop', file: 'workshop-isometric.png', width: 158, anchor: .81 },
  coop: { name: 'Chicken coop', file: 'coop-isometric.png', width: 100, anchor: .76 },
};
// Visual variants share the home simulation kind, cost, beds and footprint.
export const homeVariants = {
  'home-veranda': { name:'Home · veranda', file:'home-veranda.png', width:158, anchor:.70 },
  'home-gable': { name:'Home · gable', file:'home-gable.png', width:164, anchor:.68 },
  'home-courtyard': { name:'Home · entry terrace', file:'home-courtyard.png', width:156, anchor:.70 },
};
export const adobeVariants = {
  'adobe-gable': {name:'Adobe home · gable',file:'adobe-gable.png',width:160,anchor:.78},
  'adobe-veranda': {name:'Adobe home · veranda',file:'adobe-veranda.png',width:160,anchor:.78},
};
export const allBuildingArt = {...buildingArt,...homeVariants,...adobeVariants};
for (const [key, art] of Object.entries(allBuildingArt)) {
  const axes=measuredAxes(key);
  if(axes)art.axes=axes;
}
export const homeArtKeys = ['home', ...Object.keys(homeVariants)];
export function buildingArtKey(building, buildings, projects = []) {
  if(building.kind!=='home')return building.kind;
  const project=projects.find(p=>p.building===building.id);
  if(project?.recipe==='adobe')return Object.keys(adobeVariants)[(project.appearance??4)-4]||'adobe-gable';
  if(project?.recipe==='local')return 'home-veranda';
  if(project?.appearance!=null)return homeArtKeys[project.appearance];
  if(building.id==null){
    const previous=[...projects].filter(p=>buildings.some(b=>b.id===p.building&&b.kind==='home')).sort((a,b)=>b.building-a.building)[0];
    if(previous?.appearance!=null)return homeArtKeys[(previous.appearance+1)%homeArtKeys.length];
  }
  // Preview fixtures without projects use construction order. IDs survive save/reload and unrelated building additions. The placement
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
  const sourceWidth = image?.naturalWidth ?? image?.width;
  const sourceHeight = image?.naturalHeight ?? image?.height;
  if (!sourceWidth || !sourceHeight || image.complete === false) return;
  const [cx, cy, cw, ch] = art.cell || [0, 0, 1, 1];
  const w = art.width * scale;
  const { vertical, shear } = cameraCalibration(art);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.transform(1, shear, 0, vertical, 0, 0);
  ctx.drawImage(buildingTexture(image, art.mesh), cx * sourceWidth, cy * sourceHeight,
    cw * sourceWidth, ch * sourceHeight,
    -w / 2, -w * (art.aspect||1) * art.anchor, w, w * (art.aspect||1));
  ctx.restore();
}
