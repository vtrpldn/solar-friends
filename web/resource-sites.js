import {occupies,footprint} from './building-footprints.js';
import {MAP_SIZE,riverBank} from './terrain.js';
export const sourceKinds=['source_timber','source_bamboo','source_earth','source_stone','source_salvage'];
export const sourceMaterial=kind=>sourceKinds.indexOf(kind);
export const sourceSize=material=>material===0?3:2;
export function sourceOccupies(site,x,y){const n=sourceSize(site.material),a=site.x-Math.floor(n/2),b=site.y-Math.floor(n/2);return site.active&&x>=a&&x<a+n&&y>=b&&y<b+n;}
export function sourceDeposit(v,material,x,y){
  const n=sourceSize(material),a=x-Math.floor(n/2),b=y-Math.floor(n/2);
  return (v.land?.deposits||[]).filter(d=>d.material===material).map(d=>{
    let overlap=0;for(let X=a;X<a+n;X++)for(let Y=b;Y<b+n;Y++)if(X>=d.x&&X<d.x+d.width&&Y>=d.y&&Y<d.y+d.height)overlap++;
    return {d,overlap};
  }).filter(p=>p.overlap>0).sort((a,b)=>b.overlap-a.overlap||a.d.id-b.d.id)[0]?.d;
}
export function sourcePlacementReason(v,material,x,y){
  if(material<0||material>4)return 'Unknown material plot.';
  const n=sourceSize(material),a=x-Math.floor(n/2),b=y-Math.floor(n/2);
  if(material===3&&(x<17||y<17))return 'Stone-bearing ground is in the southeast of the property.';
  if(material>=2){
    const deposit=sourceDeposit(v,material,x,y);
    if(!deposit)return 'No matching deposit here. Check the land map for another patch.';
    if(deposit.remaining<=0)return 'This local deposit is exhausted. Choose another patch or buy supplies in town.';
  }
  for(let X=a;X<a+n;X++)for(let Y=b;Y<b+n;Y++){
    if(X<1||Y<1||X>=MAP_SIZE-1||Y>=MAP_SIZE-1||riverBank(X,Y))return 'Choose an inland clearing inside the village.';
    if((v.restoration||[]).some(j=>j.finished==null&&X>=j.x-Math.floor(j.size/2)&&X<j.x-Math.floor(j.size/2)+j.size&&Y>=j.y-Math.floor(j.size/2)&&Y<j.y-Math.floor(j.size/2)+j.size))return 'That ground is reserved for soil restoration.';
    if(v.pipes?.lines.some(p=>p.phase!=='retired'&&p.plan.cells.some(([x,y])=>x===X&&y===Y)))return 'Remove the water line on this plot before placing a material plot.';
    if(Math.abs(X-10)<1.5&&Math.abs(Y-13)<1.5||(v.building_jobs||[]).some(j=>j.destination&&occupies({...v.buildings.find(b=>b.id===j.building),x:j.destination[0],y:j.destination[1]},X,Y))||v.roads.some(([rx,ry])=>rx===X&&ry===Y)||v.buildings.some(s=>occupies(s,X,Y))||v.economy.sources.some(s=>sourceOccupies(s,X,Y)))return 'Keep buildings, paths, other plots and the arrival clearing free.';
  }
  if(v.economy.sources.length>=676)return 'This village has reached its plot limit.';
  if(v.mode!=='sandbox'&&v.economy.money<[4000,1000,1500,2500,1500][material])return 'The shared fund cannot cover this plot.';
  return '';
}
export function sourceConflicts(v,kind,x,y){const f=footprint(kind,x,y);for(let X=Math.ceil(f.minX);X<f.maxX;X++)for(let Y=Math.ceil(f.minY);Y<f.maxY;Y++)if(v.economy.sources.some(s=>sourceOccupies(s,X,Y)))return true;return false;}
export function sourceCare(site){return site.material<2&&(!site.planted||site.growth<1&&site.moisture<120);}
