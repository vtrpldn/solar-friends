import { elevationVertex } from './elevation.js';
import { riverBankAt } from './river-layout.js';
import { accessRoadAt } from './road-layout.js';
import { MAP_HALF } from './map-size.js';
export const TERRAIN_TOOLS = ['raise', 'lower', 'flatten', 'smooth'];
// Vertex overrides share the saved terrain layer, below immutable building pads.
export function terraform(s, x, z, tool, radius = 8, level = null) {
  if (!TERRAIN_TOOLS.includes(tool) || ![4,8,12].includes(radius) ||
      !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x)>MAP_HALF || Math.abs(z)>MAP_HALF) return false;
  const pads = s.terrainPads || [];
  const vertices = {...pads.find(p => p.terraform)?.vertices};
  const height = (a,b) => elevationVertex(a,b,s.elevationSeed,pads);
  const target = level ?? height(Math.round(x/2)*2,Math.round(z/2)*2);
  if (!Number.isFinite(target) || target<0 || target>12) return false;
  let changed = false;
  for(let a=Math.max(-MAP_HALF,Math.ceil((x-radius)/2)*2);a<=Math.min(MAP_HALF,x+radius);a+=2)
    for(let b=Math.max(-MAP_HALF,Math.ceil((z-radius)/2)*2);b<=Math.min(MAP_HALF,z+radius);b+=2){
      const distance=Math.hypot(a-x,b-z);
      if(distance>=radius)continue;
      const column=a/2+32,row=b/2+32;
      if(riverBankAt(column,row,3,s.landSeed) || accessRoadAt(column,row,3) ||
         Math.hypot(column-s.stock.x,row-s.stock.z)<5 ||
         pads.some(p=>!p.terraform && a>=p.left-2 && a<=p.right+2 && b>=p.top-2 && b<=p.bottom+2) ||
         s.projects.some(p=>Math.abs(column-p.x)<3 && Math.abs(row-p.z)<3))continue;
      const old=height(a,b), weight=(1-distance/radius)**2;
      const average=(height(a-2,b)+height(a+2,b)+height(a,b-2)+height(a,b+2))/4;
      const next=Math.max(0,Math.min(12,tool==='raise'?old+.6*weight:tool==='lower'?old-.6*weight:
        old+((tool==='flatten'?target:average)-old)*Math.min(1,weight*2)));
      if(Math.abs(next-old)<.00001)continue;
      vertices[`${a},${b}`]=next;changed=true;
    }
  if(changed)s.terrainPads=[...pads.filter(p=>!p.terraform),{terraform:true,vertices}];
  return changed;
}
export function validTerrainVertices(p) {
  if(p.terraform!==true || !p.vertices || typeof p.vertices!=='object' || Array.isArray(p.vertices))return false;
  const entries=Object.entries(p.vertices);
  return entries.length<=16641 && entries.every(([key,h])=>{
    if(!/^-?\d+,-?\d+$/.test(key))return false;
    const [x,z]=key.split(',').map(Number);
    return [x,z].every(n=>n%2===0 && Math.abs(n)<=MAP_HALF) && Number.isFinite(h) && h>=0 && h<=12;
  });
}
