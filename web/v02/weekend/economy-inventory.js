import {projectMaterials} from './project-materials.js';
// Ownership is derived from authoritative orders, never from rendered vehicles.
// Project materials stay project-owned while being hauled; a manifest is not a
// second copy of the same stock. Values are replacement estimates, not cash.
export function inventoryOwnership(s,projects,recipes,materials){
 const rows=Object.fromEntries(Object.keys(materials).map(id=>[id,{available:id==='wood'?s.wood:s.materials[id]||0,reserved:0,processing:0,transit:0,installed:0}]));
 const add=(items,bucket)=>{for(const [id,n]of Object.entries(items||{}))if(rows[id])rows[id][bucket]+=n;};
 for(const p of s.projects||[]){const d=projects[p.key];if(!d||p.natural||p.felled)continue;
  add(projectMaterials(p,projects),p.work>=d.work?'installed':'reserved');
 }
 for(const o of s.operations||[]){if(o.done||o.water)continue;const r=recipes[o.recipe];if(!r)continue;
  if(o.phase==='return')add(o.returnItems||o.harvestOutput||r.output,'transit');else add(r.input,'processing');
 }
 for(const o of s.trade?.orders||[])if(['queued','loaded'].includes(o.status))add({[o.material]:o.quantity},o.status==='queued'?'reserved':'transit');
 for(const t of [s.trip,s.secondTrip,s.delivery].filter(Boolean))if(!t.shipments&&!t.project&&!t.saleOnly)add({[t.material]:t.foodLots?t.foodLots.reduce((n,l)=>n+l.n,0):(t.quantity??materials[t.material]?.quantity??0)},'transit');
 const values={available:0,reserved:0,processing:0,transit:0,installed:0};
 for(const [id,row]of Object.entries(rows)){const price=(materials[id].price||0)/(materials[id].quantity||1);for(const k of Object.keys(values))values[k]+=row[k]*price;}
 return {rows,values};
}
