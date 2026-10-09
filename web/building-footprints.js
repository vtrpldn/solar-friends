import { TILE_HALF_WIDTH as W, TILE_HALF_HEIGHT as H } from './projection.js';
import { cameraCalibration } from './building-art.js';
import { buildingSilhouettes } from './building-silhouettes.js';

export function footprintSize(kind) {
  if (['square','solar_farm','source_timber'].includes(kind)) return 3;
  if (['well','compost','coop','streetlight','road','hydro','eco_toilet'].includes(kind)) return 1;
  return 2;
}
export function footprint(kind,x,y) {
  const size=footprintSize(kind),start=Math.floor(size/2);
  return {size,minX:x-start-.5,minY:y-start-.5,maxX:x-start+size-.5,maxY:y-start+size-.5};
}
export function occupies(b,x,y) {
  const f=footprint(b.kind,b.x,b.y);
  return x>f.minX && x<f.maxX && y>f.minY && y<f.maxY;
}
export function footprintCorners(kind,x,y) {
  const f=footprint(kind,x,y);
  return [[f.minX,f.minY],[f.maxX,f.minY],[f.maxX,f.maxY],[f.minX,f.maxY]];
}
// Painted ground-contact landmarks, left/front/right, in source-cell units.
// These register the building to its plot independently of transparent padding.
export const paintedGrounds={
  hydro:[1280,[[229,902],[551,1060],[1090,864]]],
  eco_toilet:[1280,[[237,975],[609,1168],[1087,974]]],
  wetland:[1774,[[357,511],[989,797],[1355,571]]],
  biodigester:[1280,[[130,844],[401,949],[1164,858]]],
  warehouse:[1280,[[107,848],[741,1133],[1188,936]]],
  'adobe-gable':[1280,[[122,882],[643,1138],[1198,917]]],
  'adobe-veranda':[1280,[[103,876],[656,1162],[1185,911]]],
  home:[640,[[75,440],[289,542],[527,422]]],
  kitchen:[640,[[64,429],[329,572],[541,452]]],
  garden:[1280,[[150,678],[626,943],[1112,696]]],
  greenhouse:[1280,[[192,874],[597,1171],[1095,934]]],
  'home-veranda':[1280,[[100,887],[574,1130],[1156,887]]],
  'home-gable':[1280,[[151,823],[650,1085],[1140,867]]],
  'home-courtyard':[1280,[[84,880],[584,1124],[1173,880]]],
  workshop:[1280,[[116,918],[588,1165],[1149,954]]],
  square:[1280,[[54,879],[634,1168],[1234,895]]],
  solar_farm:[1280,[[101,778],[595,1030],[1160,713]]],
  well:[1280,[[218,944],[590,1140],[1040,953]]],
  coop:[1280,[[240,1010],[580,1180],[1050,971]]],
  compost:[1280,[[175,871],[610,1150],[1100,911]]],
  grove:[640,[[60,440],[300,570],[570,440]]],
  streetlight:[1280,[[533,1002],[609,1038],[685,1000]]],
};
const placements=new WeakMap();
export function placementArt(kind,art) {
  const key=[kind,art.width,art.anchor,art.aspect,art.axes?.join(',')].join('|'),cached=placements.get(art);
  if(cached?.key===key)return cached.value;
  const [size,landmarks]=paintedGrounds[kind],{vertical,shear}=cameraCalibration(art);
  const groundX=(landmarks[0][0]/size+landmarks[2][0]/size-1)*art.width/2;
  const outline=buildingSilhouettes[kind].hull.map(([u,v])=>[
    (u-.5)*art.width-groundX,
    ((v-art.anchor*(art.aspect||1))*vertical+(u-.5)*shear)*art.width,
  ]);
  const n=footprintSize(kind),halfWidth=Math.max(...outline.map(([x])=>Math.abs(x)));
  const front=Math.max(...outline.map(([x,y])=>y+Math.abs(x)*H/W));
  // Use the full painted volume, preserving its proportions. Walls and roofs
  // rise above their ground plot. Its actual front outline meets the tile edges;
  // transparent canvas padding never counts towards the size or the anchor.
  const gain=n*W/halfWidth,center=(n-1)/2-Math.floor(n/2);
  const value={scale:gain,x:-groundX*gain,y:center*2*H+n*H-front*gain};
  placements.set(art,{key,value});return value;
}
