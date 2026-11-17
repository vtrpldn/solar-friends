// Existing stock counts remain pieces/packs. Explicit definitions avoid the old
// silent 2 kg fallback. Except eggs, these remain engineering/game assumptions.
export const MATERIAL_UNITS=Object.freeze({
 wood:['timber piece',4,.012],logs:['raw wood piece',6,.015],planks:['plank',1.5,.005],
 bamboo:['pole',3,.018],earth:['20 kg earth pack',20,.015],stone:['20 kg stone pack',20,.012],
 frames:['frame',4,.04],walls:['wall-material pack',18,.025],tiles:['tile bundle',12,.012],
 roofing:['roof sheet',8,.035],tank:['empty tank',12,.35],batteries:['battery unit',30,.05],
 panels:['panel',20,.12],goats:['animal',40,.4],hens:['bird',2,.025],bees:['colony with hive',15,.08],
 cooling:['refrigeration kit',35,.35],hardware:['fastener pack',2,.01],tarp:['tarp and rope kit',2,.01],
 plumbing:['pipe and tap kit',2,.01],sanitation:['toilet kit',2,.01],electrical:['electrical pack',2,.01],
 covering:['covering roll',2,.01],pumps:['pump',2,.01],tools:['tool pack',2,.01],
 food:['kg ingredients',1,.002],meals:['meal portion',1,.002],eggs:['egg',.06,.0001],
 milk:['liter milk (rounded mass)',1,.002],honey:['kg honey',1,.002],fodder:['kg dry fodder',1,.002],
 compost:['kg compost',1,.002],scraps:['kg organic residues',1,.002],
 seedlings:['seedling pack',2,.01],tree_starts:['tree seedling',2,.01],bamboo_starts:['bamboo start',2,.01],
});
export function materialMeasure(id){
 const unit=MATERIAL_UNITS[id];if(!unit)throw new Error(`Missing material measurement: ${id}`);
 const [,kg,m3]=unit;return {kg,m3};
}
export function materialUnitText(id){const [unit,kg,m3]=MATERIAL_UNITS[id];return `Per stock unit: ${unit}; approximately ${kg} kg and ${(m3*1000).toFixed(1)} L cargo space. Pack sizes are model estimates.`;}
export function materialMass(items){return Object.entries(items).reduce((sum,[id,n])=>sum+materialMeasure(id).kg*n,0);}
