import { unlitFilter } from './power.js';
export const economyAtlasFile='economy-atlas.png';
export const economyAtlasSize=[1254,1254];
// Three crowded atlas cells use measured transparent gutters rather than equal column cuts.
export const economyArt = [
  {name:'Managed timber',cell:[0,0,1/3,.5],width:100,anchor:.95},
  {name:'Bamboo stand',cell:[1/3,0,1/3,.5],width:90,anchor:.95},
  {name:'Building earth',cell:[824/1254,0,430/1254,.5],width:108.02,anchor:.95},
  {name:'Stone deposit',cell:[0,.5,432/1254,.5],width:103.35,anchor:.76},
  {name:'Salvage clearing',cell:[432/1254,.5,402/1254,.5],width:96.17,anchor:.76},
  {name:'Camp receiving bench',cell:[2/3,.5,1/3,.5],width:85,anchor:.76},
];
economyArt.forEach(art=>{art.aspect=art.cell[3]*economyAtlasSize[1]/(art.cell[2]*economyAtlasSize[0]);});
export const economyImage = typeof Image==='undefined'?null:new Image();
if(economyImage)economyImage.src=`art/${economyAtlasFile}`;
// Runtime and artwork tools share actual crop geometry, including rectangular atlases.
export function drawEconomySprite(ctx,image,art,x,y,scale=1){
  if(!image?.naturalWidth)return;
  const [u,v,cw,ch]=art.cell,w=art.width*scale;
  const sw=cw*image.naturalWidth,sh=ch*image.naturalHeight,h=w*sh/sw;
  ctx.drawImage(image,u*image.naturalWidth,v*image.naturalHeight,sw,sh,x-w/2,y-h*art.anchor,w,h);
}
export function drawEconomyArt(ctx,index,x,y,scale,night=0,remaining=1){
  if(!economyImage?.complete||!economyImage.naturalWidth)return;
  ctx.save();ctx.filter=unlitFilter(night,remaining<.03?.25:1);
  ctx.globalAlpha*=remaining<.03 ? .55 : 1;
  drawEconomySprite(ctx,economyImage,economyArt[index],x,y,scale);ctx.restore();
}
