import {drawEconomyArt} from './economy-art.js';
import {paintWorldTree} from './world-renderer.js';
export function paintResourceSite(ctx,site,{project,scale,width,height,forest,details,night=0,alpha=1}){
  if(!site.active)return;
  ctx.save();ctx.globalAlpha*=alpha;
  if(site.material<2&&!site.planted&&site.harvests===0){
    const n=site.material===0?3:2;for(const [dx,dy]of [[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]]){const p=project(site.x+dx*(n-1),site.y+dy*(n-1));ctx.strokeStyle='#765438';ctx.lineWidth=2*scale;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-8*scale);ctx.stroke();ctx.fillStyle='#dbc28a';ctx.fillRect(p.x-3*scale,p.y-9*scale,6*scale,3*scale);}
  }else if(site.material===0){
    const mature=site.growth>=1,trees=mature?Math.ceil(site.remaining/8):site.planted?4:0;
    for(let i=0;i<4;i++){const x=site.x+(i%2?.7:-.7),y=site.y+(i<2?-.7:.7);
      if(i<trees)paintWorldTree(ctx,{x,y,size:.18+.42*(mature?1:site.growth),species:0},{project,scale,width,height,forest,details,night});
      else {const p=project(x,y);ctx.fillStyle='#86502e';ctx.fillRect(p.x-4*scale,p.y-4*scale,8*scale,5*scale);ctx.fillStyle='#c78c4d';ctx.beginPath();ctx.ellipse(p.x,p.y-4*scale,4*scale,2*scale,0,0,Math.PI*2);ctx.fill();}
    }
  }else if(site.material===1){const growth=site.planted?site.growth:0,cut=site.growth>=1?site.remaining/site.maximum:1;
    for(const [dx,dy]of [[-.35,.35],[.35,-.35]]){const p=project(site.x+dx,site.y+dy);drawEconomyArt(ctx,1,p.x,p.y,scale*(.25+.75*growth)*(.45+.55*cut),night,1);}
  }else{const p=project(site.x,site.y);drawEconomyArt(ctx,site.material,p.x,p.y,scale,night,site.remaining/site.maximum);}
  ctx.restore();
}
