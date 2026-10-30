import {routeNames,hitStartingRoute} from './routes.js';
export const sceneLayers={utilities:{legend:'Inspect installed and planned utility corridors. Solid lines are installed; dashed lines await resident work. An installed corridor does not guarantee flow or power. Test the village to check operation.'},regions:{legend:'Inspect named goal regions. A building counts only when its whole occupied plot fits inside the target region. Shown goal references are authored links, not completion progress.'}};
export function routeVisible(route,view){return view.layer!=='regions'&&(view.layer!=='utilities'||!view.utilityKind||view.utilityKind==='all'||view.utilityKind===route.kind);}
export function sceneRouteAt(definition,view,x,y){return hitStartingRoute({...definition,start:{...definition.start,routes:(definition.start.routes??[]).filter(r=>routeVisible(r,view))}},x,y);}
export function utilityLines(snapshot,kind='all'){
 return (snapshot.village.pipes?.lines??[]).filter(p=>p.phase!=='retired'&&(kind==='all'||p.plan.kind===kind));
}
export function goalRegions(definition,id='all'){const regions=definition.map.regions??[];return regions.some(r=>r.id===id)?regions.filter(r=>r.id===id):regions;}
export function regionGoals(definition,id){
 const uses=c=>c?.region===id||(c?.conditions??[]).some(uses);
 return (definition.journal?.chapters??[]).flatMap(c=>c.goals.filter(g=>uses(g.condition)).map(g=>({chapter:c.title,title:g.title})));
}
export function sceneFilter(definition,view){
 if(view.layer==='utilities')return {label:'Utility class',value:Object.hasOwn(routeNames,view.utilityKind)?view.utilityKind:'all',options:[['all','All utilities'],...Object.entries(routeNames)]};
 if(view.layer==='regions'){const regions=definition.map.regions??[];return {label:'Goal region',value:regions.some(r=>r.id===view.regionId)?view.regionId:'all',options:[['all','All named regions'],...regions.map(r=>[r.id,r.title])]};}
 return null;
}
export function sceneSummary(definition,snapshot,view){
 if(view.layer==='utilities'){
  const lines=utilityLines(snapshot,view.utilityKind),kinds=view.utilityKind&&view.utilityKind!=='all'?[view.utilityKind]:Object.keys(routeNames);
  return (definition.rules.utilities?'':'Local utility rules are disabled. ')+kinds.map(kind=>{const list=lines.filter(p=>p.plan.kind===kind),installed=list.filter(p=>p.phase==='active').length;return `${routeNames[kind]}: ${installed} installed, ${list.length-installed} planned.`;}).join(' ');
 }
 if(view.layer==='regions'){
  const regions=goalRegions(definition,view.regionId);
  return regions.length?regions.map(r=>{const goals=regionGoals(definition,r.id);return `${r.title}: ${r.width} × ${r.height} cells · ${goals.length} goal ${goals.length===1?'reference':'references'}${goals.length?' ('+goals.map(g=>g.chapter+' / '+g.title).join('; ')+')':''}.`;}).join(' '):'No named regions yet. Draw a region from Journal to give goals a target area.';
 }
 return '';
}
