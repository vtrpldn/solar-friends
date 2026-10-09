import {occupies,footprint} from './building-footprints.js';
import {MAP_SIZE,riverBank} from './terrain.js';
export const sourceKinds=['source_timber','source_bamboo','source_earth','source_stone','source_salvage'];
export const sourceMaterial=kind=>sourceKinds.indexOf(kind);
export const sourceSize=material=>material===0?3:2;
export function sourceOccupies(site,x,y){const n=sourceSize(site.material),a=site.x-Math.floor(n/2),b=site.y-Math.floor(n/2);return site.active&&x>=a&&x<a+n&&y>=b&&y<b+n;}
export function sourcePlacementReason(v,material,x,y){
  if(material<0||material>4)return 'Unknown material plot.';
  const n=sourceSize(material),a=x-Math.floor(n/2),b=y-Math.floor(n/2);
  if(material===3&&(x<17||y<17))return 'Stone-bearing ground is in the southeast of the property.';
  for(let X=a;X<a+n;X++)for(let Y=b;Y<b+n;Y++){
    if(X<1||Y<1||X>=MAP_SIZE-1||Y>=MAP_SIZE-1||riverBank(X,Y))return 'Choose an inland clearing inside the village.';
    if(Math.abs(X-10)<1.5&&Math.abs(Y-13)<1.5||v.roads.some(([rx,ry])=>rx===X&&ry===Y)||v.buildings.some(s=>occupies(s,X,Y))||v.economy.sources.some(s=>sourceOccupies(s,X,Y)))return 'Keep buildings, paths, other plots and the arrival clearing free.';
  }
  if(v.economy.sources.length>=676)return 'This village has reached its plot limit.';
  if(v.mode!=='sandbox'&&v.economy.money<[8000,3000,1500,2500,1500][material])return 'The shared fund cannot cover this plot.';
  if(material<2&&v.water<2&&(v.circular?.reclaimed||0)<2)return 'Set aside two irrigation water for planting.';
  if(material>=2&&v.economy.land[material-2]<=0)return 'This property reserve is exhausted. Buy material in town.';
  return '';
}
export function sourceConflicts(v,kind,x,y){const f=footprint(kind,x,y);for(let X=Math.ceil(f.minX);X<f.maxX;X++)for(let Y=Math.ceil(f.minY);Y<f.maxY;Y++)if(v.economy.sources.some(s=>sourceOccupies(s,X,Y)))return true;return false;}
export function sourceCare(site){return site.material<2&&(!site.planted||site.growth<1&&site.moisture<120);}
