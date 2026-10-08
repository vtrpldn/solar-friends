import { TILE_HALF_WIDTH as W, TILE_HALF_HEIGHT as H } from './projection.js';
import { cameraCalibration } from './building-art.js';
import { meshPoint } from './building-mesh.js';

export function footprintSize(kind) {
  if (['square','solar_farm'].includes(kind)) return 3;
  if (['well','compost','coop','streetlight','road'].includes(kind)) return 1;
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
const grounds={
  home:[640,[[75,440],[289,542],[527,422]]],
  kitchen:[640,[[64,429],[329,572],[541,452]]],
  garden:[1280,[[150,678],[626,943],[1112,696]]],
  greenhouse:[1280,[[192,874],[597,1171],[1095,934]]],
  'home-veranda':[1280,[[100,887],[574,1130],[1156,887]]],
  'home-gable':[1280,[[151,823],[650,1085],[1140,867]]],
  'home-courtyard':[1280,[[84,880],[584,1124],[1173,880]]],
  workshop:[1280,[[116,918],[588,1165],[1149,954]]],
  square:[1280,[[199,828],[698,1058],[1092,838]]],
  solar_farm:[1280,[[101,778],[595,1030],[1160,713]]],
  well:[1280,[[218,944],[590,1140],[1040,953]]],
  coop:[1280,[[240,1010],[580,1180],[1050,971]]],
  compost:[1280,[[175,871],[610,1150],[1100,911]]],
  grove:[640,[[60,440],[300,570],[570,440]]],
  streetlight:[1280,[[533,1002],[609,1038],[685,1000]]],
};
export function placementArt(kind,art) {
  const [size,landmarks]=grounds[kind],{vertical,shear}=cameraCalibration(art);
  const points=landmarks.map(p=>{
    const [u,v]=meshPoint(art.mesh,p),x=(u/size-.5)*art.width,y=((v/size-art.anchor)*vertical+(u/size-.5)*shear)*art.width;
    return [(x/W+y/H)/2,(y/H-x/W)/2];
  });
  const min=axis=>Math.min(...points.map(p=>p[axis])),max=axis=>Math.max(...points.map(p=>p[axis]));
  const n=footprintSize(kind),gain=Math.min(n*.96/Math.max(max(0)-min(0),max(1)-min(1)),['streetlight','well','coop','compost','grove'].includes(kind)?1:1.5);
  const cx=(min(0)+max(0))/2,cy=(min(1)+max(1))/2;
  const center=(n-1)/2-Math.floor(n/2);
  return {scale:gain,x:-(cx-cy)*W*gain,y:center*2*H-(cx+cy)*H*gain-2};
}
export function drawFoundation(ctx,kind,x,y,scale=1,alpha=1,night=0) {
  // A food forest grows directly in the terrain; its sprite includes ground cover.
  if(kind==='grove')return;
  const corners=footprintCorners(kind,0,0).map(([u,v])=>[(u-v)*W,(u+v)*H]);
  const soil=['garden','solar_farm','compost'].includes(kind);
  const path=(points,color)=>{ctx.beginPath();points.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.closePath();ctx.fillStyle=color;ctx.fill();};
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.globalAlpha*=alpha;ctx.filter=`brightness(${1-night*.45})`;
  path(corners,soil?'#987650':'#b5a181');
  path(corners.map(([a,b])=>[a,b-2]),soil?'#bc9668':'#ddc9a5');
  ctx.restore();
}
