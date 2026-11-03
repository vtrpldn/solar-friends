import {syncStartingFresh} from './liquid-data.js';
export const newStartingBuilding=(kind,x,y,id=crypto.randomUUID())=>({id,kind,x,y,state:'completed',recipe:'standard',appearance:null});
// Draft transforms retain references on moves and allocate identities once for
// copies, before a transaction is replayed for native validation and commit.
// A pump endpoint refers to a route, not a building with the same text ID.
function internalRoutes(definition,buildings){
  const included=new Set(),routes=definition.start.routes??[];
  const inside=end=>end.kind==='building'?buildings.has(end.id):end.kind==='pump'&&included.has(end.id);
  let changed=true;
  while(changed){changed=false;for(const route of routes)if(!included.has(route.id)&&inside(route.from)&&inside(route.to)){included.add(route.id);changed=true;}}
  return routes.filter(route=>included.has(route.id));
}
export function planBuildingCopy(definition,ids,makeId=()=>crypto.randomUUID()){
  const selected=new Set(ids),buildings=definition.start.buildings.filter(b=>selected.has(b.id));
  const remap=new Map(buildings.map(b=>[b.id,makeId()]));
  if(new Set(remap.values()).size!==remap.size||[...remap.values()].some(id=>definition.start.buildings.some(b=>b.id===id)))throw Error('Could not allocate distinct building identities.');
  const routes=internalRoutes(definition,selected),routeIds=new Map(routes.map(route=>[route.id,makeId()]));
  if(new Set(routeIds.values()).size!==routeIds.size||[...routeIds.values()].some(id=>(definition.start.routes??[]).some(route=>route.id===id)))throw Error('Could not allocate distinct connection identities.');
  const endpoint=end=>({...structuredClone(end),id:(end.kind==='pump'?routeIds:remap).get(end.id)});
  const equipment=(definition.start.equipment??[]).flatMap(entry=>{
    const ids=entry.asset.kind==='pump'?routeIds:['workshop','building_battery'].includes(entry.asset.kind)?remap:null;
    return ids?.has(entry.asset.id)?[{...structuredClone(entry),asset:{...entry.asset,id:ids.get(entry.asset.id)}}]:[];
  });
  return {routes:routes.map(route=>({...structuredClone(route),id:routeIds.get(route.id),from:endpoint(route.from),to:endpoint(route.to)})),equipment,buildings:buildings.map(b=>({...structuredClone(b),id:remap.get(b.id)})),inventories:definition.start.inventories.filter(p=>p.owner.kind==='building'&&remap.has(p.owner.building)).map(p=>({...structuredClone(p),owner:{kind:'building',building:remap.get(p.owner.building)}})),liquids:(definition.start.liquids??[]).filter(p=>p.owner.kind==='building'&&remap.has(p.owner.building)).map(p=>({...structuredClone(p),owner:{kind:'building',building:remap.get(p.owner.building)}}))};
}
export function moveBuildings(definition,ids,dx,dy){
  const selected=new Set(ids);
  const routes=internalRoutes(definition,selected);
  for(const b of definition.start.buildings)if(selected.has(b.id)){b.x+=dx;b.y+=dy;}
  for(const route of routes)route.cells=route.cells.map(([x,y])=>[x+dx,y+dy]);
}
export function placeBuildingCopy(definition,copy,dx,dy){
  definition.start.buildings.push(...copy.buildings.map(b=>({...structuredClone(b),x:b.x+dx,y:b.y+dy})));
  definition.start.inventories.push(...structuredClone(copy.inventories));
  if(copy.routes?.length)(definition.start.routes??=[]).push(...copy.routes.map(route=>({...structuredClone(route),cells:route.cells.map(([x,y])=>[x+dx,y+dy])})));
  if(copy.equipment?.length)(definition.start.equipment??=[]).push(...structuredClone(copy.equipment));
  if(copy.liquids?.length){(definition.start.liquids??=[]).push(...structuredClone(copy.liquids));syncStartingFresh(definition);}
}
