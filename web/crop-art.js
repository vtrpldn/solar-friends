import { greenhouseBeds, greenhousePlants, greenhouseGlass, greenhouseDoor } from './greenhouse-layout.js';
import { preparedFrames, drawPreparedFrame } from './sprite-frames.js';
import { buildingArt, cameraCalibration } from './building-art.js?v=night-1';
export const cropTypes = {
  maize:{name:'Maize',minutes:720,yield:14,note:'Large harvest · thirsty crop · rotate after beans to rebuild the soil'},
  cassava:{name:'Cassava',minutes:1440,yield:20,note:'Slow staple crop · soil dries half as fast'},
  fodder:{name:'Fodder grass',minutes:480,yield:10,note:'Animal feed, not household food · soil dries half as fast · routine tending pauses around 24 stored fodder'},
  lettuce: { name:'Lettuce', minutes:180, yield:5, note:'Quick crop · one harvest' },
  beans: { name:'Beans', minutes:360, yield:10, note:'Larger harvest · soil dries half as fast' },
  tomatoes: { name:'Tomatoes', minutes:300, yield:6, note:'Three harvests · later harvests take 3 hours; compost maintains yield' },
};
export const cropFrameOptions = {columns:3,rows:3,referenceRow:2};
export function cropDuration(c) { return c.kind === 'tomatoes' && c.harvests > 0 ? 180 : cropTypes[c.kind || 'lettuce'].minutes; }
export function cropFrame(c) {
  const column=(['maize','cassava','fodder'].includes(c.kind)?['maize','cassava','fodder']:['lettuce','beans','tomatoes']).indexOf(c.kind || 'lettuce');
  const fraction=c.growth/cropDuration(c);
  return (fraction >= 1 ? 2 : fraction >= .33 ? 1 : 0)*3 + Math.max(0,column);
}
let cropArt,fieldArt,ready;
export function loadCropArt(source) {
  if(!ready){cropArt=new Image();cropArt.src=source || new URL('./art/crops.png',import.meta.url).href;fieldArt=new Image();fieldArt.src=new URL('./art/field-crops.png',import.meta.url).href;ready=Promise.all([cropArt,fieldArt].map(image=>image.decode().then(()=>preparedFrames(image,cropFrameOptions))));}
  return ready;
}
export function drawCrops(ctx,b,x,y,scale=1,night=0,health=1,light=0) {
  if(!cropArt?.naturalWidth||!fieldArt?.naturalWidth)return;
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
    const illumination=greenhouse?Math.max(0,Math.min(1,Number.isFinite(light)?light:0)):0;
    const filter=`brightness(${1-night*.45*(1-illumination)}) saturate(${c.moisture>0 ? Math.max(.45,Math.min(1,health)) : .55})${c.moisture>0 ? '' : ' sepia(.3)'}`;
    const width=(c.kind==='lettuce'?22:['maize','cassava'].includes(c.kind)?30:26)*(greenhouse?.85:1);
    const ordered=positions.map(([u,v])=>point(u,v)).sort((a,b)=>a[1]-b[1]);
    for(const p of ordered)drawPreparedFrame(ctx,['maize','cassava','fodder'].includes(c.kind)?fieldArt:cropArt,cropFrame(c),p[0],p[1],width,cropFrameOptions,filter);
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
