// Authored calibration scaffold. Units are the existing catalog packs/pieces;
// these coefficients are gameplay estimates, not SINAPI measurements.
export const CONSTRUCTION_LABOR_VERSION=2;
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
  d.construction.packWork=d.work;
  if(['home','kitchen','warehouse','shed'].includes(d.kind)){
   // Economic dimensions are explicit: one cell is two meters, independently
   // of stylized roof overhangs. These are simple shells, not turnkey homes.
   const [w,z]=d.size,area=w*z*4,wallArea=d.kind==='shed'?0:2*(w+z)*2*2.6*.8,roofArea=area*1.2;
   d.legacyMaterials={...d.materials};
   const earthWall=d.kind==='home'&&!d.materials.walls&&!!d.materials.earth;
   const bill={...d.materials};
   bill.stone=Math.max(bill.stone||0,Math.ceil(area*120/20));
   bill.earth=Math.max(bill.earth||0,Math.ceil(area*40/20+(earthWall?wallArea*200/20:0)));
   if(wallArea&&!earthWall)bill.walls=Math.max(bill.walls||0,Math.ceil(wallArea*80/18));
   bill.wood=Math.max(bill.wood||0,Math.ceil(roofArea*.02/.012));
   if(bill.tiles)bill.tiles=Math.max(bill.tiles,Math.ceil(roofArea*40/12));
   else bill.roofing=Math.max(bill.roofing||0,Math.ceil(roofArea/2));
   d.materials=bill;
   const used=new Set(),phase=(name,ids,hours)=>({name,materials:Object.fromEntries(ids.filter(id=>bill[id]&&!used.has(id)).map(id=>{used.add(id);return [id,bill[id]];})),hours});
   const phases=[phase('Foundation and level floor',['stone','earth'],area*1.5),phase(earthWall?'Earth wall preparation and assembly':'Wall assembly',['walls'],wallArea*(earthWall?3:2.415)),phase('Roof structure and weather covering',['wood','bamboo','tiles','roofing','covering'],roofArea*1.1)];
   phases.push(phase('Openings and basic fit-out',Object.keys(bill),area));
   const total=Math.round(phases.reduce((sum,p)=>sum+p.hours,0)*100)/100;
   Object.assign(d.construction,{version:2,basis:'Area-based simple shell; engineering quantities and referenced wall labor',area,wallArea,roofArea,phases,hours:total});
   d.work=total*60/.45;
  }
 }
}
export function migrateConstructionLabor(s,projects){
 if(s.constructionLaborVersion===CONSTRUCTION_LABOR_VERSION)return true;
 if(s.constructionLaborVersion!==undefined&&s.constructionLaborVersion!==1)return false;
 const oldWork=d=>s.constructionLaborVersion===1?(d.construction?.packWork??d.work):(d.construction?.legacyWork??d.work);
 for(const p of s.projects){const d=projects[p.key];if(!d)return false;
  const old=oldWork(d);
  if(!Number.isFinite(p.work)||p.work<0||p.work>old)return false;
 }
 for(const p of s.projects){const d=projects[p.key],old=oldWork(d);
  p.work=p.work===old?d.work:p.work/old*d.work;
  if(p.removal){const ratio=p.removal.work/p.removal.required;p.removal.required=Math.max(30,d.work*(p.removal.mode==='move'?.2:p.removal.mode==='salvage'?.3:.1));p.removal.work=ratio*p.removal.required;}
 }
 s.constructionLaborVersion=CONSTRUCTION_LABOR_VERSION;
 return true;
}
export function constructionSpecText(d){
 if(!d.construction)return '';
 return `Assembly estimate: ${d.construction.hours.toFixed(1)} person-hours before hauling, breaks, skills and crew coordination. ${d.construction.phases.map(p=>`${p.name}: ${p.hours.toFixed(1)} h`).join('; ')}. ${d.construction.area?`${d.construction.area} m² basic shell; excludes decorative finishes. Wall labor uses SINAPI reference coefficients; other quantities are engineering assumptions.`:"Game estimates."}`;
}
