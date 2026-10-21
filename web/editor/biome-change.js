const regional={
 'mata-atlantica':['jequitiba-rosa','jucara','embauba','pau-brasil','forest-ferns','bromeliads'],
 cerrado:['pequi','barbatimao','cerrado-bunchgrass','campo-shrub'],
 caatinga:['umbuzeiro','jurema-preta','mandacaru','macambira'],
};
const primary={'mata-atlantica':'atlantic-forest',cerrado:'cerrado-savanna',caatinga:'caatinga-woodland'};
export function compatibleSpecies(key,target){
 const owner=Object.entries(regional).find(([,keys])=>keys.includes(key));
 return !owner||owner[0]===target;
}
export function regionalSpecies(target){return [...(regional[target]||[])];}
export function suggestedReplacement(key,target,catalog){
 const old=catalog.nature.find(s=>s.key===key),options=catalog.nature.filter(s=>regional[target]?.includes(s.key));
 const role=radius=>radius>1?'tree':radius>0?'shrub':'ground';
 const matching=options.filter(s=>role(s.crown_radius)===role(old?.crown_radius||0));
 return (matching.length?matching:options).sort((a,b)=>Math.abs(a.crown_radius-(old?.crown_radius||0))-Math.abs(b.crown_radius-(old?.crown_radius||0)))[0]?.key;
}
export function planBiomeChange(definition,catalog,{target,weather='destination',terrain='labels',replacements={}}){
 const preset=catalog.biomes.find(b=>b.id===target);if(!preset)throw Error('Choose an available biome.');
 if(!['destination','keep'].includes(weather)||!['keep','labels','defaults'].includes(terrain))throw Error('Choose supported weather and ground options.');
 if(!Array.isArray(definition.map.terrain)||!Array.isArray(definition.map.nature)||!Array.isArray(definition.map.deposits))throw Error('Resolve the current property before changing its biome.');
 const candidate=structuredClone(definition),groups=new Map(),known=new Map(catalog.nature.map(s=>[s.key,s]));
 const previous=catalog.biomes.find(b=>b.id===definition.map.biome?.id&&b.version===definition.map.biome?.version);
 if(weather==='keep'&&definition.map.biome&&!previous&&!definition.rules.weather)throw Error('The original biome weather is unavailable. Choose destination weather or keep the original draft.');
 const before=definition.rules.weather??previous?.weather??catalog.weather;
 candidate.map.biome={id:target,version:preset.version};
 if(weather==='destination')delete candidate.rules.weather;else candidate.rules.weather=structuredClone(before);
 const unresolved=[];let removed=0,replaced=0,resized=0;
 candidate.map.nature=candidate.map.nature.flatMap(plant=>{
  if(known.has(plant.species)&&compatibleSpecies(plant.species,target))return [plant];
  groups.set(plant.species,(groups.get(plant.species)||0)+1);
  const choice=replacements[plant.species];
  if(choice==='remove'){removed++;return [];}
  if(!known.has(choice)||!compatibleSpecies(choice,target)){if(!unresolved.includes(plant.species))unresolved.push(plant.species);return [plant];}
  const species=known.get(choice),size=Math.max(species.min_size,Math.min(species.max_size,plant.size));
  if(size!==plant.size)resized++;replaced++;return [{...plant,species:choice,size}];
 });
 let groundChanged=0;const h=catalog.habitats.find(h=>h.key===primary[target]);
 if(terrain!=='keep')for(const cell of candidate.map.terrain){
  if(!Object.values(primary).includes(cell.habitat)||cell.habitat===primary[target])continue;
  cell.habitat=primary[target];groundChanged++;
  if(terrain==='defaults')for(const key of ['fertility','retention','cover'])cell[key]=h[key];
 }
 return {candidate,groups:[...groups].map(([key,count])=>({key,count})),unresolved,removed,replaced,resized,groundChanged,before,after:candidate.rules.weather??preset.weather};
}
