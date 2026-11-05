import {createMapPackage,validateMapPackage} from '../map-package.js';

// Resolve only known legacy omissions. Never use a stale world to fill an
// invalid draft's land, and never replace an authored climate with defaults.
export function prepareSharedMap(definition,{catalog,resolved=null,defaultMap}){
  const map=structuredClone(resolved?.map??definition.map);
  map.biome??={id:'mata-atlantica',version:1};
  if(!Object.hasOwn(map,'river'))map.river=structuredClone(defaultMap.river);
  const authoredBiome=definition.map.biome;
  const biome=authoredBiome?catalog.biomes.find(b=>b.id===authoredBiome.id&&b.version===authoredBiome.version):null;
  const weather=structuredClone(definition.rules.weather??(authoredBiome?biome?.weather:catalog.weather));
  if(!weather)throw Error('This landscape needs an available weather profile before sharing.');
  return {map,weather};
}

function emptySettlementOnMap(source,template){
  const d=structuredClone(template);
  const items={};for(const inventory of d.start.inventories)for(const [key,n]of Object.entries(inventory.items))items[key]=(items[key]??0)+n;
  d.map=structuredClone(source.map);d.rules.weather=structuredClone(source.weather);d.rules.mode='sandbox';d.title=source.title;d.description=source.description;delete d.journal;
  d.start={residents:structuredClone(template.start.residents),minutes:template.start.minutes,funds:template.start.funds,fresh_water:template.start.fresh_water,buildings:[],roads:[],inventories:[{owner:{kind:'camp'},items}]};
  return d;
}

export function mapPreviewDefinition(file,template,validate){
  return emptySettlementOnMap(validateMapPackage(file,validate),template);
}

function sharedMapCredits(source){
  const own={release:source.id,revision:source.content_revision,author:source.author};
  const credits=structuredClone(source.credits??[]);
  if(!credits.some(c=>c.release===own.release&&c.revision===own.revision&&c.author===own.author))credits.push(own);
  return credits;
}

export function scenarioFromSharedMap(file,template,validate){
  const source=validateMapPackage(file,validate),credits=sharedMapCredits(source);
  if(credits.length>16)throw Error('This map already has the maximum source credits. Keep the original export.');
  return {definition:emptySettlementOnMap(source,template),credits};
}

export function sandboxFromSharedMap(file,template,validate){
  const source=validateMapPackage(file,validate),definition=emptySettlementOnMap(source,template);
  const [x,y]=definition.map.camp;
  const [baseX,baseY]=template.map.camp;
  // Keep the familiar orientation first. Turn the whole layout around the
  // authored camp so both plots keep their spacing and inventory identities.
  const orientations=[
    (dx,dy)=>[dx,dy],
    (dx,dy)=>[-dy,dx],
    (dx,dy)=>[-dx,-dy],
    (dx,dy)=>[dy,-dx]
  ];
  const buildingLayouts=orientations.map(orient=>template.start.buildings.map(building=>{
    const [dx,dy]=orient(building.x-baseX,building.y-baseY);
    return {...structuredClone(building),x:x+dx,y:y+dy};
  }));
  definition.start.buildings=buildingLayouts[0];
  definition.start.inventories=structuredClone(template.start.inventories);
  return {definition,buildingLayouts,credits:sharedMapCredits(source)};
}

export function checkSharedMap({map,weather,title,description,author,credits=[],validate}){
  return createMapPackage({id:'map-sharing-check',version:1,map,weather,title,description,author,credits,validate});
}
