import { greenhouseBeds, greenhousePlants, greenhouseGlass, greenhouseDoor } from './greenhouse-layout.js';
import { preparedFrames, drawPreparedFrame } from './sprite-frames.js';
import { buildingArt, cameraCalibration } from './building-art.js?v=night-1';
export const cropTypes = {
  lettuce: { name:'Lettuce', minutes:180, yield:5, note:'Quick crop · one harvest' },
  beans: { name:'Beans', minutes:360, yield:10, note:'Larger harvest · soil dries half as fast' },
  tomatoes: { name:'Tomatoes', minutes:300, yield:6, note:'Three harvests · later harvests take 3 hours; compost maintains yield' },
};
export const cropFrameOptions = {columns:3,rows:3,referenceRow:2};
export function cropDuration(c) { return c.kind === 'tomatoes' && c.harvests > 0 ? 180 : cropTypes[c.kind || 'lettuce'].minutes; }
export function cropFrame(c) {
  const column=['lettuce','beans','tomatoes'].indexOf(c.kind || 'lettuce');
  const fraction=c.growth/cropDuration(c);
  return (fraction >= 1 ? 2 : fraction >= .33 ? 1 : 0)*3 + Math.max(0,column);
}
let cropArt,ready;
export function loadCropArt(source) {
  if(!ready){cropArt=new Image();cropArt.src=source || new URL('./art/crops.png',import.meta.url).href;ready=cropArt.decode().then(()=>preparedFrames(cropArt,cropFrameOptions));}
  return ready;
}
export function drawCrops(ctx,b,x,y,scale=1,night=0) {
  if(!cropArt?.naturalWidth)return;
  const greenhouse=b.kind==='greenhouse',art=buildingArt[b.kind],w=art.width;
  const {vertical,shear}=cameraCalibration(art),c=b.crop;
  const point=(u,v)=>[(u-.5)*w,((v-art.anchor)*vertical+(u-.5)*shear)*w];
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  const path=polygons=>{
    ctx.beginPath();
    for(const polygon of polygons){polygon.forEach(([u,v],i)=>{const p=point(u,v);if(i)ctx.lineTo(...p);else ctx.moveTo(...p);});ctx.closePath();}
  };
  const positions=greenhouse ? greenhousePlants :
    Array.from({length:9},(_,i)=>{const u=i%3-1,v=Math.floor(i/3)-1;return [.495+(u-v)*.105,.52+(u+v)*.0525];});
  const soil=greenhouse ? greenhouseBeds : [[[.155,.52],[.495,.325],[.837,.52],[.495,.711]]];
  const paint=()=>{
    path(soil);ctx.fillStyle=c.moisture>0?'rgba(55,32,20,.17)':'rgba(204,163,102,.28)';ctx.fill();
    if(!c.planted)return;
    ctx.filter=`brightness(${1-night*.45}) saturate(${c.moisture>0 ? 1 : .55})${c.moisture>0 ? '' : ' sepia(.3)'}`;
    const width=(c.kind==='lettuce'?22:26)*(greenhouse?.85:1);
    const ordered=positions.map(([u,v])=>point(u,v)).sort((a,b)=>a[1]-b[1]);
    for(const p of ordered)drawPreparedFrame(ctx,cropArt,cropFrame(c),p[0],p[1],width,cropFrameOptions);
  };
  if(greenhouse){
    // Glass mutes the leaves. Through the open door they keep their color.
    // Separate clips retain timber occlusion without chopping every plant to
    // the old doorway-sized patch or drawing soil across the walking aisle.
    for(const [apertures,opacity] of [[greenhouseGlass,.72],[[greenhouseDoor],1]]){
      ctx.save();path(apertures);ctx.clip();ctx.globalAlpha*=opacity;paint();ctx.restore();
    }
  }else paint();
  ctx.restore();
}
