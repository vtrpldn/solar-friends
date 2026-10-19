import {paintProcedural} from './paint-cache.js';
import {unlitFilter} from './power.js';
export const batteryImage=typeof Image==='undefined'?null:new Image();
if(batteryImage)batteryImage.src=new URL('./art/recovered-battery.png',import.meta.url).href;
// Measured painted silhouette, excluding transparent generator canvas margins.
export const batteryArt={crop:[350,288,566,710],width:22,anchor:.985};
function paintBattery(ctx,p,scale,night=0,alpha=1,carried=false){
  if(!batteryImage?.naturalWidth)return;
  const [x,y,w,h]=batteryArt.crop,width=batteryArt.width*scale,height=width*h/w;
  ctx.save();ctx.globalAlpha*=alpha;ctx.filter=unlitFilter(night);
  if(!carried){ctx.fillStyle='#2d3e2b25';ctx.beginPath();ctx.ellipse(p.x,p.y,9*scale,4*scale,0,0,Math.PI*2);ctx.fill();}
  ctx.drawImage(batteryImage,x,y,w,h,p.x-width/2,p.y-height*batteryArt.anchor,width,height);
  ctx.restore();
}

export function drawBattery(ctx,p,scale,night=0,alpha=1,carried=false){
 if(!batteryImage?.naturalWidth)return;
 const shade=Math.round(night*64)/64;
 ctx.save();ctx.globalAlpha*=alpha;
 paintProcedural(ctx,'battery:'+shade+':'+carried,[-13,-31,26,38],p.x,p.y,scale,local=>paintBattery(local,{x:0,y:0},1,shade,1,carried));
 ctx.restore();
}
