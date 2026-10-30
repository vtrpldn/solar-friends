// Shared final world shading. Sprite-local night colours and depth-masked
// emissions are prepared by the caller; interface layers remain outside it.
export function paintWorldAtmosphere(ctx,{minutes,darkness,width,height,lightLayer}){
 const hour=(minutes%1440)/60;
 const altitude=Math.sin(((hour-6)/12)*Math.PI);
 const twilight=Math.max(0,1-Math.abs(altitude)/.3)*.16;
 ctx.fillStyle=`rgba(237,150,84,${twilight})`;ctx.fillRect(0,0,width,height);
 ctx.fillStyle=`rgba(17,31,65,${darkness*.62})`;ctx.fillRect(0,0,width,height);
 if(darkness>0&&lightLayer){ctx.save();ctx.globalCompositeOperation='screen';ctx.drawImage(lightLayer,0,0,lightLayer.width,lightLayer.height,0,0,width,height);ctx.restore();}
}
