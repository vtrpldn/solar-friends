// Three crowded atlas cells use measured transparent gutters rather than equal column cuts.
export const economyArt = [
  {name:'Managed timber',cell:[0,0,1/3,.5],width:100,anchor:.95},
  {name:'Bamboo stand',cell:[1/3,0,1/3,.5],width:90,anchor:.95},
  {name:'Building earth',cell:[824/1254,0,430/1254,.5],width:108.02,anchor:.95},
  {name:'Stone deposit',cell:[0,.5,432/1254,.5],width:103.35,anchor:.76},
  {name:'Salvage clearing',cell:[432/1254,.5,402/1254,.5],width:96.17,anchor:.76},
  {name:'Camp receiving bench',cell:[2/3,.5,1/3,.5],width:85,anchor:.76},
];
export const economyImage = typeof Image==='undefined'?null:new Image();
if(economyImage)economyImage.src='art/economy-atlas.png';
export function drawEconomyArt(ctx,index,x,y,scale,night=0,remaining=1){
  if(!economyImage?.complete||!economyImage.naturalWidth)return;
  const a=economyArt[index],[u,v,cw,ch]=a.cell,w=a.width*scale,h=w*ch/cw;
  ctx.save();ctx.filter=`brightness(${1-night*.65}) saturate(${remaining<.03 ? .25 : 1})`;
  ctx.globalAlpha*=remaining<.03 ? .55 : 1;
  ctx.drawImage(economyImage,u*economyImage.naturalWidth,v*economyImage.naturalHeight,cw*economyImage.naturalWidth,ch*economyImage.naturalHeight,x-w/2,y-h*a.anchor,w,h);ctx.restore();
}
