// Authored calibration scaffold. Units are the existing catalog packs/pieces;
// these coefficients are gameplay estimates, not SINAPI measurements.
export const CONSTRUCTION_LABOR_VERSION=1;
const groups=[
 {id:'groundwork',name:'Groundwork',materials:['earth','stone'],hours:.12},
 {id:'structure',name:'Structure',materials:['wood','bamboo','planks'],hours:.15},
 {id:'framing',name:'Prepared framing',materials:['frames'],hours:.6},
 {id:'enclosure',name:'Walls and roof',materials:['walls','tiles','roofing','covering','tarp'],hours:.25},
 {id:'connections',name:'Fasteners and utilities',materials:['hardware','plumbing','electrical'],hours:.3},
 {id:'equipment',name:'Equipment installation',materials:['tank','pumps','sanitation','panels','batteries'],hours:1},
];
const specifiedKinds=new Set(['home','shed','kitchen','warehouse','road','bridge']);
export function applyConstructionSpecs(projects){
 for(const [key,d]of Object.entries(projects)){
  // First-camp assembly recipes already have explicit labor; preserve them.
  if(!specifiedKinds.has(d.kind)||['shelter'].includes(key))continue;
  const phases=[],assigned=new Set();
  if(d.kind==='home'&&!d.materials.walls&&d.materials.earth){assigned.add('earth');phases.push({name:'Earth wall preparation',materials:{earth:d.materials.earth},hours:d.materials.earth*.12});}
  for(const g of groups){const materials=Object.fromEntries(g.materials.filter(id=>d.materials[id]&&!assigned.has(id)).map(id=>{assigned.add(id);return [id,d.materials[id]];}));
   if(Object.keys(materials).length)phases.push({name:g.name,materials,hours:Object.values(materials).reduce((n,q)=>n+q,0)*g.hours});
  }
  const other=Object.fromEntries(Object.entries(d.materials).filter(([id])=>!assigned.has(id)));
  if(Object.keys(other).length)phases.push({name:'Other supplies',materials:other,hours:Object.values(other).reduce((n,q)=>n+q,0)*.15});
  const setup=d.kind==='road'?.1:d.kind==='home'?3:1;
  phases.unshift({name:'Setting out and assembly preparation',materials:{},hours:setup});
  const hours=Math.round(phases.reduce((n,p)=>n+p.hours,0)*100)/100;
  d.construction={version:1,basis:'Authored pack-based estimate',phases,hours,legacyWork:d.work};
  d.work=hours*60/.45;
 }
}
export function migrateConstructionLabor(s,projects){
 if(s.constructionLaborVersion===CONSTRUCTION_LABOR_VERSION)return true;
 if(s.constructionLaborVersion!==undefined)return false;
 for(const p of s.projects){const d=projects[p.key];if(!d)return false;
  const old=d.construction?.legacyWork??d.work;
  if(!Number.isFinite(p.work)||p.work<0||p.work>old)return false;
 }
 for(const p of s.projects){const d=projects[p.key],old=d.construction?.legacyWork??d.work;
  p.work=p.work===old?d.work:p.work/old*d.work;
 }
 s.constructionLaborVersion=CONSTRUCTION_LABOR_VERSION;
 return true;
}
export function constructionSpecText(d){
 if(!d.construction)return '';
 return `Assembly estimate: ${d.construction.hours.toFixed(1)} person-hours before hauling, breaks, skills and crew coordination. ${d.construction.phases.map(p=>`${p.name}: ${p.hours.toFixed(1)} h`).join('; ')}. Game estimates; regional calibration pending.`;
}
