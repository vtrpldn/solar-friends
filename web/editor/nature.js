import {riverBank} from '../terrain.js';
import {occupies} from '../building-footprints.js';
export function resolvedNature(definition,snapshot,catalog){
  return definition.map.nature??snapshot.village.land.vegetation.filter(t=>!t.cleared).map(t=>({id:`nature-${t.index}`,species:catalog[t.species].key,x:t.x,y:t.y,size:t.size}));
}
export function plantStroke(definition,existing,catalog,key,size,cells,width,makeId=()=>crypto.randomUUID(),density=1){
  const species=catalog.find(s=>s.key===key),nativeSize=Math.fround(size);
  if(!species||!Number.isFinite(size)||nativeSize<species.min_size||nativeSize>species.max_size)throw Error('Choose a supported plant and size.');
  if(![.25,.5,1].includes(density))throw Error('Choose a supported cluster density.');
  const spacingScale=1/Math.sqrt(density);
  const points=new Map(),start=Math.floor(width/2),byKey=new Map(catalog.map(s=>[s.key,s]));
  for(const [x,y]of cells)for(let a=x-start;a<x-start+width;a++)for(let b=y-start;b<y-start+width;b++)if(a>=0&&a<64&&b>=0&&b<64)points.set(`${a},${b}`,[a,b]);
  const added=[];
  for(const [x,y]of points.values()){
    if(existing.length+added.length>=1000)break;
    if(riverBank(x,y,definition.map)||definition.start.roads.some(([a,b])=>a===x&&b===y)||definition.start.buildings.some(b=>occupies(b,x,y)))continue;
    if(Math.abs(x-definition.map.camp[0])<1.5&&Math.abs(y-definition.map.camp[1])<1.5)continue;
    const crowded=[...existing,...added].some(p=>{const minimum=(species.spacing+(byKey.get(p.species)?.spacing||1))/2*Math.min(size,p.size);return Math.hypot(x-p.x,y-p.y)<(density===1?minimum:Math.max(1,minimum)*spacingScale);});
    if(!crowded)added.push({id:makeId(),species:key,x,y,size});
  }
  return added;
}
export function thinStroke(objects,cells,width){
  const start=Math.floor(width/2);
  return objects.filter(p=>!cells.some(([x,y])=>p.x>=x-start-.5&&p.x<x-start+width-.5&&p.y>=y-start-.5&&p.y<y-start+width-.5));
}
// Select at the ground anchor, including small plants and fractional generated
// positions. Resolve overlapping anchors to the nearest, then frontmost object.
export function natureAt(objects,x,y){
  return objects.filter(p=>Math.hypot(p.x-x,p.y-y)<=.8).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)||(b.x+b.y)-(a.x+a.y))[0]??null;
}
export function placeNatureObject(definition,objects,catalog,source,x,y,size=source.size,{copy=false,makeId=()=>crypto.randomUUID()}={}){
  const existing=copy?objects:objects.filter(p=>p.id!==source.id);
  const added=plantStroke(definition,existing,catalog,source.species,size,[[x,y]],1,()=>copy?makeId():source.id);
  if(!added.length)throw Error('Choose clear inland ground with room between plants, away from buildings, roads and the arrival camp.');
  const replacement={...source,...added[0]};
  return copy?[...objects,replacement]:objects.map(p=>p.id===source.id?replacement:p);
}
