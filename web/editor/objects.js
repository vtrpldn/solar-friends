import {syncStartingFresh} from './liquid-data.js';
// Draft transforms retain references on moves and allocate identities once for
// copies, before a transaction is replayed for native validation and commit.
export function planBuildingCopy(definition,ids,makeId=()=>crypto.randomUUID()){
  const selected=new Set(ids),buildings=definition.start.buildings.filter(b=>selected.has(b.id));
  const remap=new Map(buildings.map(b=>[b.id,makeId()]));
  if(new Set(remap.values()).size!==remap.size||[...remap.values()].some(id=>definition.start.buildings.some(b=>b.id===id)))throw Error('Could not allocate distinct building identities.');
  return {buildings:buildings.map(b=>({...structuredClone(b),id:remap.get(b.id)})),inventories:definition.start.inventories.filter(p=>p.owner.kind==='building'&&remap.has(p.owner.building)).map(p=>({...structuredClone(p),owner:{kind:'building',building:remap.get(p.owner.building)}})),liquids:(definition.start.liquids??[]).filter(p=>p.owner.kind==='building'&&remap.has(p.owner.building)).map(p=>({...structuredClone(p),owner:{kind:'building',building:remap.get(p.owner.building)}}))};
}
export function moveBuildings(definition,ids,dx,dy){
  const selected=new Set(ids);
  for(const b of definition.start.buildings)if(selected.has(b.id)){b.x+=dx;b.y+=dy;}
}
export function placeBuildingCopy(definition,copy,dx,dy){
  definition.start.buildings.push(...copy.buildings.map(b=>({...structuredClone(b),x:b.x+dx,y:b.y+dy})));
  definition.start.inventories.push(...structuredClone(copy.inventories));
  if(copy.liquids?.length){(definition.start.liquids??=[]).push(...structuredClone(copy.liquids));syncStartingFresh(definition);}
}
