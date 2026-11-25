import {GATHERING,gatheringStatus} from './gathering.js';
import { PROJECTS, PROCESSES, footprint, requiredLoads, materialCount } from './simulation.js';
import { hasPowerService, LIQUIDS } from './infrastructure.js';
import { constructionStatus } from './construction-logistics.js';
import { depositCapacity } from './land-layout.js';

export const LENSES = [
  ['power','Power','Supply, demand and installed connections.'],
  ['water','Water','Stored water and installed pipes, by liquid.'],
  ['construction','Construction','Deliveries and assembly still needed.'],
  ['resources','Resources','Local trees and finite deposits.'],
  ['residents','Residents','Current activities and needs below 30.'],
  ['access','Access & hauling','Actual queued walking paths; straight-line distances from supplies are estimates, not reachability.'],
  ['food','Food','Food production sites, current jobs and shared supplies.'],
  ['sanitation','Sanitation','Waste storage and installed wastewater pipes.'],
  ['work','Work','Construction, production queues and assigned workers.'],
  ['land','Land & slope','Ground elevation and local slope; building rules still apply.'],
  ['comfort','Comfort','Daily-life facilities and resident needs; proximity does not guarantee access.'],
  ['ecology','Ecology','Standing trees, queued felling, cleared trees and cultivated land.'],
  ['chains','Production chains','Potential producers and consumers of a material; lines show shared-stock relationships, not delivery routes.'],
].map(([id,name,description])=>({id,name,description}));
export const COLORS={good:'#70d6ad',warn:'#ffc76a',bad:'#ff827a',info:'#80c9ed',muted:'#c7b9a4'};
const foodIds=['food','meals','eggs','milk','honey'];
const leisure=['square','reading-room','outdoor-classroom','exercise-garden','volleyball-court','community-hall','picnic-table','garden-bench','fire-circle','hammock'];
const pretty=s=>String(s).replaceAll('_',' ').replaceAll('-',' ');
export function lensData(s,id,{liquid='fresh',material='wood'}={}) {
  const marks=[],lines=[],sys=s.infrastructure||{nodes:{},links:[]};
  const projects=s.projects||[],people=s.people||[],ops=(s.operations||[]).filter(o=>!o.done);
  const upstream=new Set([material]);
  if(id==='chains'){
    // Walk recipe inputs with a visited set: recycling chains may contain cycles.
    for(const resource of upstream)for(const recipe of Object.values(PROCESSES))if(recipe.output[resource])for(const input of Object.keys(recipe.input))upstream.add(input);
  }
  const mark=(p,label,detail,tone='info',size=1)=>marks.push({x:p.x,z:p.z,label,detail,tone,size,projectId:p.projectId});
  const projectMark=(p,detail,tone='info')=>{const size=footprint(p);mark({x:p.x+(size[0]-1)/2,z:p.z+(size[1]-1)/2,projectId:p.id},PROJECTS[p.key].name,detail,tone,Math.max(...size));};
  const stock=()=>mark(s.stock,'Shared supplies',id==='chains'?`${pretty(material)}: ${materialCount(s,material)}`:foodIds.map(k=>`${pretty(k)}: ${materialCount(s,k)}`).join(' · '),'info',3);
  const operationText=p=>ops.filter(o=>o.site===p.id).map(o=>o.status|| (o.water?'Water service queued':`${PROCESSES[o.recipe]?.name||'Production'} queued`)).join(' · ')||p.productionStatus||'No job queued';
  const workTone=p=>{
    if(sys.nodes[p.id]?.enabled===false)return 'muted';
    const jobs=ops.filter(o=>o.site===p.id);
    if(jobs.some(o=>['Building switched off','Waiting for usable water','Greywater tank is full; waiting for it to be emptied','Waiting for power','Storage full','Storage full; output is still carried','Destination full; water remains in the sealed carrier.'].includes(o.status)))return 'bad';
    return jobs.length?'good':'warn';
  };
  if(['power','water','sanitation'].includes(id)) {
    const kinds=id==='power'?['power']:id==='sanitation'?['greywater','sewage']:[liquid];
    for(const n of Object.values(sys.nodes)) {
      const indices=kinds.map(k=>LIQUIDS.indexOf(k)).filter(i=>i>=0);
      if(id==='power'?!hasPowerService(sys,n):!indices.some(i=>n.capacity[i]>0))continue;
      let tone='good',detail;
      if(!n.enabled)tone='muted';
      if(id==='power') {
        if(n.enabled&&n.demand>0&&n.power<.99)tone='bad';
        detail=`${n.enabled?'Enabled':'Switched off'} · demand ${(n.demand||0).toFixed(2)} kW · ${n.demand>0?`${Math.round(n.power*100)}% supplied`:'no current demand'}${n.battery?` · battery ${n.charge.toFixed(1)}/${n.battery} kWh`:''}${n.generation?` · generating ${n.generation.toFixed(2)} kW`:''}`;
      }else {
        const waste=id==='sanitation'||['greywater','sewage'].includes(liquid);
        const full=indices.some(i=>n.capacity[i]>0&&n.water[i]>=n.capacity[i]-.01),empty=indices.every(i=>!n.water[i]);
        tone=!n.enabled?'muted':waste?(full?'bad':'good'):(empty?'warn':'good');
        detail=indices.filter(i=>n.capacity[i]).map(i=>`${pretty(LIQUIDS[i])}: ${n.water[i].toFixed(1)}/${n.capacity[i]}`).join(' · ');
      }
      mark({...n,projectId:n.id>0?n.id:undefined},n.id===0?'Camp':n.id===-1?'River':PROJECTS[projects.find(p=>p.id===n.id)?.key]?.name||pretty(n.kind),detail,tone,2);
    }
    for(const l of sys.links.filter(l=>kinds.includes(l.kind))) {
      const a=sys.nodes[l.from],b=sys.nodes[l.to];if(!a||!b)continue;
      lines.push({points:[a,b],tone:!l.enabled?'muted':l.work<l.required?'warn':'good'});
    }
  }
  for(const p of projects) {
    const d=PROJECTS[p.key];if(!d)continue;
    const kind=d.kind||p.key,done=p.work>=d.work;
    const recipes=Object.values(PROCESSES).filter(r=>r.kind===kind);
    if(p.felled){if(id==='ecology')projectMark(p,'Tree cleared · does not regrow automatically','muted');continue;}
    if(id==='construction'&&!done)projectMark(p,constructionStatus(s,p,d,requiredLoads(p)),p.delivered<requiredLoads(p)?'warn':'good');
    if(id==='resources'&&d.natural){const recipe=recipes.find(r=>r.deposit);projectMark(p,GATHERING[p.key]?gatheringStatus(s,p):recipe?`${Math.max(0,depositCapacity(s.landSeed,p,recipe)-(p.extracted||0))} units remain`:ops.some(o=>o.site===p.id)?'Felling queued · yields raw wood':'Standing tree · yields raw wood',recipe&&(p.extracted||0)>=depositCapacity(s.landSeed,p,recipe)?'muted':'good');}
    if(id==='ecology'&&(d.natural||['garden','grove','orchard','greenhouse'].includes(kind)))projectMark(p,kind==='wild-tree'?(ops.some(o=>o.site===p.id)?'Marked for felling':'Standing tree'):GATHERING[p.key]?gatheringStatus(s,p):d.natural?'Natural deposit':'Cultivated land',ops.some(o=>o.site===p.id)&&kind==='wild-tree'?'warn':'good');
    if(id==='food'&&recipes.some(r=>foodIds.some(k=>r.output[k])))projectMark(p,done?operationText(p):'Under construction',done?workTone(p):'warn');
    if(id==='work'&&(!done||recipes.length)) {const crew=people.filter(r=>r.job===p.id||ops.some(o=>o.site===p.id&&r.operation===o.id)).length;projectMark(p,`${crew} assigned · ${done?operationText(p):constructionStatus(s,p,d,requiredLoads(p))}`,done?workTone(p):crew?'good':'warn');}
    if(id==='access'&&!d.natural&&!['road','bridge'].includes(kind))projectMark(p,`${Math.hypot(p.x-s.stock.x,p.z-s.stock.z).toFixed(1)} cells from shared supplies (straight line)`,Math.hypot(p.x-s.stock.x,p.z-s.stock.z)>25?'warn':'info');
    if(id==='comfort'&&['home','kitchen','eco_toilet','wash-station',...leisure].includes(kind)) {
      const nearest=predicate=>{const sites=Object.values(sys.nodes).filter(n=>n.enabled&&predicate(n));return sites.length?`${Math.min(...sites.map(n=>Math.hypot(n.x-p.x,n.z-p.z))).toFixed(0)} cells`:'none available';};
      const detail=kind==='home'&&done?`Straight-line proximity · meals at supplies ${Math.hypot(p.x-s.stock.x,p.z-s.stock.z).toFixed(0)} cells · washing ${nearest(n=>['home','wash-station','eco_toilet','camp'].includes(n.kind)&&n.water[0]>=1&&n.capacity[2]-n.water[2]>=.8)} · toilet ${nearest(n=>['home','eco_toilet'].includes(n.kind)&&n.capacity[3]-n.water[3]>=1.5)} · leisure ${nearest(n=>leisure.includes(n.kind))}`:`${pretty(kind)} · ${!done?'Under construction':sys.nodes[p.id]?.enabled===false?'Switched off':'Built'} · inspect for service details`;
      projectMark(p,detail,done?'good':'warn');
    }
    if(id==='chains') {
      const produces=recipes.some(r=>r.output[material]),consumes=recipes.some(r=>r.input[material])||(!done&&d.materials?.[material]);
      const inputs=recipes.flatMap(r=>Object.keys(r.output)).filter(k=>k!==material&&upstream.has(k));
      if(produces||consumes||inputs.length){
        const role=[produces?'Potential producer':'',consumes?'Consumer':'',inputs.length?`Upstream source: ${[...new Set(inputs)].map(pretty).join(', ')}`:''].filter(Boolean).join(' / ');
        const tone=produces?'good':consumes?'warn':'info';
        projectMark(p,`${role} · ${done?operationText(p):'Under construction'}`,tone);
        // Upstream trees remain marked without drawing a fan of unrelated-material links.
        if(produces||consumes)lines.push({points:[s.stock,p],tone});
      }
    }
  }
  if(['residents','comfort','access','work'].includes(id))for(const r of people) {
    if (r.outsideWork?.phase === 'away') continue;
    const needs=[['energy',r.energy],...Object.entries(r.needs||{})].filter(([,v])=>v<30);
    mark(r,r.name,`${pretty(r.action||'idle')}${r.needBlocked?` · ${r.needBlocked}`:''}${needs.length?' · '+needs.map(([k,v])=>`${pretty(k)} ${Math.round(v)}%`).join(', '):' · no needs below 30'}`,needs.length?'bad':'good');
    if(id==='access'&&r.walk?.length)lines.push({points:[r,...r.walk.map(p=>Array.isArray(p)?{x:p[0],z:p[1]}:p)],tone:r.cargo?'warn':'info'});
  }
  if(['food','chains'].includes(id))stock();
  return {marks,lines};
}
