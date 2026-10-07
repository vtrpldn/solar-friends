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
  ctx.beginPath();
  // For the greenhouse, only the open doorway exposes the growing bed.
  const soil=greenhouse ? [[.518,.58],[.674,.50],[.688,.659],[.518,.749]] : [[.155,.52],[.495,.325],[.837,.52],[.495,.711]];
  soil.forEach(([u,v],i)=>{const p=point(u,v);if(i)ctx.lineTo(...p);else ctx.moveTo(...p);});ctx.closePath();
  ctx.fillStyle=c.moisture>0?'rgba(55,32,20,.17)':'rgba(204,163,102,.28)';ctx.fill();
  if(greenhouse)ctx.clip();
  if(c.planted){
    ctx.filter=`brightness(${1-night*.45}) saturate(${c.moisture>0 ? 1 : .55})${c.moisture>0 ? '' : ' sepia(.3)'}`;
    const positions=greenhouse ? [[.564,.653],[.625,.627],[.565,.704],[.628,.675]] :
      Array.from({length:9},(_,i)=>{const u=i%3-1,v=Math.floor(i/3)-1;return [.495+(u-v)*.105,.52+(u+v)*.0525];});
    const width=c.kind==='lettuce'?22:26;
    for(const [u,v] of positions){const p=point(u,v);drawPreparedFrame(ctx,cropArt,cropFrame(c),p[0],p[1],greenhouse?width*.8:width,cropFrameOptions);}
  }
  ctx.restore();
}
