import {paintImage} from './paint-cache.js';
import { unlitFilter } from './power.js';
export const economyAtlasFile='economy-atlas-v2.png';
export const economyAtlasSize=[1536,1024];
// Measured rectangles keep complete silhouettes and transparent gutters on all six props.
const cell=(x,y,w,h)=>[x/1536,y/1024,w/1536,h/1024];
export const economyArt = [
  {name:'Managed timber',cell:cell(8,62,492,548),width:90,anchor:.95},
  {name:'Bamboo stand',cell:cell(540,24,430,560),width:78,anchor:.965},
  {name:'Building earth',cell:cell(1000,248,535,352),width:88,anchor:.94},
  {name:'Stone deposit',cell:cell(20,670,495,321),width:78,anchor:.93},
  {name:'Salvage clearing',cell:cell(550,568,440,437),width:66,anchor:.95},
  {name:'Camp receiving bench',cell:cell(1047,608,477,391),width:62,anchor:.95},
];
economyArt.forEach(art=>{art.aspect=art.cell[3]*economyAtlasSize[1]/(art.cell[2]*economyAtlasSize[0]);});
export const economyImage = typeof Image==='undefined'?null:new Image();
if(economyImage)economyImage.src=new URL(`./art/${economyAtlasFile}`,import.meta.url).href;
// Runtime and artwork tools share actual crop geometry, including rectangular atlases.
export function drawEconomySprite(ctx,image,art,x,y,scale=1,filter=ctx.filter){
  if(!image?.naturalWidth)return;
  const [u,v,cw,ch]=art.cell,w=art.width*scale;
  const sw=cw*image.naturalWidth,sh=ch*image.naturalHeight,h=w*sh/sw;
  ctx.save();ctx.filter='none';ctx.translate(x,y-3*scale);ctx.scale(w*.34,w*.17);
  const shade=ctx.createRadialGradient(0,0,.05,0,0,1);
  shade.addColorStop(0,'#34452b20');shade.addColorStop(1,'#34452b00');
  ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();
  paintImage(ctx,image,u*image.naturalWidth,v*image.naturalHeight,sw,sh,x-w/2,y-h*art.anchor,w,h,filter);
}
export function drawEconomyArt(ctx,index,x,y,scale,night=0,remaining=1){
  if(!economyImage?.complete||!economyImage.naturalWidth)return;
  ctx.save();const filter=unlitFilter(night,remaining<.03?.25:1);
  ctx.globalAlpha*=remaining<.03 ? .55 : 1;
  drawEconomySprite(ctx,economyImage,economyArt[index],x,y,scale,filter);ctx.restore();
}
