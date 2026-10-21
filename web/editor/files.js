import {canonical} from './journal.js';
export const MAX_CREATION_BYTES=2*1024*1024;
const encoder=new TextEncoder();
export function creationFile(definition){
  const compact=canonical(definition);
  if(encoder.encode(compact).length>MAX_CREATION_BYTES)throw Error('This creation exceeds the supported sharing size. Reduce it before exporting.');
  const pretty=JSON.stringify(JSON.parse(compact),null,2);
  return encoder.encode(pretty).length<=MAX_CREATION_BYTES?pretty:compact;
}
// Called only against a successful fresh compilation, never a stale preview of
// an incomplete draft. Already authored fields are retained exactly.
export function freezeCreation(definition,{terrain,snapshot,catalog}){
  const result=structuredClone(definition),map=result.map;
  map.terrain??=structuredClone(terrain);
  map.nature??=snapshot.village.land.vegetation.filter(t=>!t.cleared).map(t=>{
    const species=catalog.nature[t.species];if(!species)throw Error('This creation needs a different species catalog.');
    return {id:`nature-${t.index}`,species:species.key,x:t.x,y:t.y,size:t.size};
  });
  map.deposits??=snapshot.village.land.deposits.map(p=>{
    const material=catalog.materials[p.material];if(!material)throw Error('This creation needs a different material catalog.');
    return {id:`patch-${p.id}`,material,x:p.x,y:p.y,width:p.width,height:p.height,quantity:p.maximum};
  });
  return result;
}
