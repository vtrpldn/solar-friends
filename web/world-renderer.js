import {drawCrops} from './crop-art.js';
import {regionalNatureArt,regionalImages} from './regional-art.js';
// Shared painted-world primitives. Editor and game use the same projection,
// sprite registration, vegetation crops, and building lighting.
import {TILE_HALF_WIDTH,TILE_HALF_HEIGHT} from './projection.js';
import {GROUND_START,GROUND_SIZE} from './terrain.js';
import {natureArt} from './nature-art.js';
import {paintImage} from './paint-cache.js';
import {allBuildingArt,drawBuildingArt} from './building-art.js?v=night-1';
import {placementArt} from './building-footprints.js';
import {lightingLayers,unlitFilter} from './power.js';
export const forestSpecies=[{name:'Jequitibá-rosa',width:145},{name:'Juçara',width:112},{name:'Embaúba',width:113},{name:'Pau-brasil',width:125}];

export function worldTreeBounds({x,y,size=1,species=0},{project,scale}){
  const p=project(x,y),art=species>=12?regionalNatureArt[species-12]:species>=4?natureArt[species-4]:forestSpecies[species];
  if(!art)return null;
  const w=art.width*size*scale,h=w*(art.aspect||1),anchor=species<4?.85:art.anchor,anchorX=species>=12?art.anchorX:.5;
  const shadow=species<4?23:species>=12?(art.shadow||0):0,rx=shadow*size*scale,ry=rx*.5,shadowY=p.y+(species<4?2*scale:0);
  return {left:Math.min(p.x-w*anchorX,p.x-rx)-4,top:Math.min(p.y-h*anchor,shadowY-ry)-4,right:Math.max(p.x+w*(1-anchorX),p.x+rx)+4,bottom:Math.max(p.y+h*(1-anchor),shadowY+ry)+4};
}

export function paintWorldGround(ctx,ground,origin,scale){
  ctx.save();ctx.transform(TILE_HALF_WIDTH*scale,TILE_HALF_HEIGHT*scale,-TILE_HALF_WIDTH*scale,TILE_HALF_HEIGHT*scale,origin.x,origin.y);
  ctx.drawImage(ground,GROUND_START,GROUND_START,GROUND_SIZE,GROUND_SIZE);ctx.restore();
}
export function paintContactShadow(ctx,x,y,rx,ry,opacity=.2){
  ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
  const shade=ctx.createRadialGradient(0,0,.1,0,0,1);
  shade.addColorStop(0,`rgba(53,65,31,${opacity})`);shade.addColorStop(1,'rgba(53,65,31,0)');
  ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();
}
export function paintWorldTree(ctx,{x,y,size=1,species=0},{project,scale,width,height,forest,details,night=0}){
  const p=project(x,y);
  if(p.x< -180*scale||p.x>width+180*scale||p.y< -30*scale||p.y>height+220*scale)return;
  if(species>=12){
    const art=regionalNatureArt[species-12],image=art&&regionalImages[art.file];if(!image)return;
    const [cx,cy,cw,ch]=art.cell,w=art.width*size*scale,h=w*art.aspect;
    if(art.shadow)paintContactShadow(ctx,p.x,p.y,art.shadow*size*scale,art.shadow*.5*size*scale,.14);
    ctx.save();paintImage(ctx,image,cx*image.width,cy*image.height,cw*image.width,ch*image.height,p.x-w*art.anchorX,p.y-h*art.anchor,w,h,unlitFilter(night));ctx.restore();return;
  }
  if(species>=4){
    const art=natureArt[species-4];if(!art||!details?.complete||!details.naturalWidth)return;
    const [cx,cy,cw,ch]=art.cell,w=art.width*size*scale,h=w*art.aspect;
    ctx.save();paintImage(ctx,details,cx*details.width,cy*details.height,cw*details.width,ch*details.height,p.x-w/2,p.y-h*art.anchor,w,h,unlitFilter(night));ctx.restore();return;
  }
  if(!forestSpecies[species]||!forest?.naturalWidth)return;
  const w=forestSpecies[species].width*size*scale,cell=forest.width/2;
  paintContactShadow(ctx,p.x,p.y+2*scale,23*size*scale,11.5*size*scale,.16);
  const args=[(species%2)*cell,Math.floor(species/2)*cell,cell,cell,p.x-w/2,p.y-w*.85,w,w];
  if(night>0)paintImage(ctx,forest,...args,unlitFilter(night));
  else ctx.drawImage(forest,...args);
}
export function paintWorldBuilding(ctx,{key,x,y,alpha=1,emptyAnimals=false},{project,scale,images,nightImages=images,night=0,light=1}){
  const art=allBuildingArt[key];if(!art)return;
  const p=project(x,y),registration=placementArt(key,art);
  for(const layer of lightingLayers(night,light,alpha)){
    const filtered={...art,renderFilter:layer.source==='night'&&art.nightTint?art.nightTint:layer.filter};
    ctx.save();drawBuildingArt(ctx,(layer.source==='night'?nightImages:images)[emptyAnimals&&art.emptyFile?key+':empty':key],filtered,p.x+registration.x*scale,p.y+registration.y*scale,scale*registration.scale,layer.alpha);ctx.restore();
  }
}

export function paintWorldCrops(ctx,building,{project,scale,night=0,health=1,alpha=1,light=0}){
  if(!building?.crop||!['garden','greenhouse'].includes(building.kind))return;
  const p=project(building.x,building.y),registration=placementArt(building.kind,allBuildingArt[building.kind]);
  ctx.save();ctx.globalAlpha*=alpha;
  drawCrops(ctx,building,p.x+registration.x*scale,p.y+registration.y*scale,scale*registration.scale,night,health,light);
  ctx.restore();
}
