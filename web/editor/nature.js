import {riverBank} from '../terrain.js';
import {occupies} from '../building-footprints.js';
export function resolvedNature(definition,snapshot,catalog){
  return definition.map.nature??snapshot.village.land.vegetation.filter(t=>!t.cleared).map(t=>({id:`nature-${t.index}`,species:catalog[t.species].key,x:t.x,y:t.y,size:t.size}));
}
export function plantStroke(definition,existing,catalog,key,size,cells,width,makeId=()=>crypto.randomUUID()){
  const species=catalog.find(s=>s.key===key);if(!species||size<species.min_size||size>species.max_size)throw Error('Choose a supported plant and size.');
  const points=new Map(),start=Math.floor(width/2),byKey=new Map(catalog.map(s=>[s.key,s]));
  for(const [x,y]of cells)for(let a=x-start;a<x-start+width;a++)for(let b=y-start;b<y-start+width;b++)if(a>=0&&a<64&&b>=0&&b<64)points.set(`${a},${b}`,[a,b]);
  const added=[];
  for(const [x,y]of points.values()){
    if(existing.length+added.length>=1000)break;
    if(riverBank(x,y,definition.map)||definition.start.roads.some(([a,b])=>a===x&&b===y)||definition.start.buildings.some(b=>occupies(b,x,y)))continue;
    if(Math.abs(x-definition.map.camp[0])<1.5&&Math.abs(y-definition.map.camp[1])<1.5)continue;
    const crowded=[...existing,...added].some(p=>Math.hypot(x-p.x,y-p.y)<(species.spacing+(byKey.get(p.species)?.spacing||1))/2*Math.min(size,p.size));
    if(!crowded)added.push({id:makeId(),species:key,x,y,size});
  }
  return added;
}
export function thinStroke(objects,cells,width){
  const start=Math.floor(width/2);
  return objects.filter(p=>!cells.some(([x,y])=>p.x>=x-start-.5&&p.x<x-start+width-.5&&p.y>=y-start-.5&&p.y<y-start+width-.5));
}
