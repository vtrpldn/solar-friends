import assert from 'node:assert/strict';
import {addCombinedEditorLoad} from './combined-editor-load.mjs';
export function routeEditorLoad(game,d,catalog){
 const load=addCombinedEditorLoad(game,d,catalog);d.start.routes.splice(-5);
 const pairs={fresh:['well','kitchen'],greywater:['kitchen','wetland'],irrigation:['wetland','garden'],sewage:['eco_toilet','banana_treatment'],electricity:['solar_farm','pump']};
 for(const [kind,[fromKind,toKind]]of Object.entries(pairs)){
  const e=JSON.parse(game.scenario_utility_endpoints(JSON.stringify(d),kind));assert(e.allowed,e.reason);const candidates=e.endpoints.filter(a=>a.ready&&a.supply&&a.kind===fromKind).flatMap(a=>e.endpoints.filter(b=>b.ready&&b.receive&&b.kind===toKind&&(toKind!=='pump'||b.reference.id==='inspect-fresh')).map(b=>({a,b,distance:Math.abs(a.x-b.x)+Math.abs(a.y-b.y)}))).sort((a,b)=>a.distance-b.distance);let route;
  for(const {a,b}of candidates){const p=JSON.parse(game.scenario_route_preview(JSON.stringify(d),kind,JSON.stringify(a.reference),JSON.stringify(b.reference)));if(!p.allowed)continue;route={id:'inspect-'+kind,kind,from:a.reference,to:b.reference,state:'completed',cells:p.cells};d.start.routes.push(route);break;}
  assert(route,'Need a native-valid '+kind+' connection');
 }
 const report=JSON.parse(game.validate_scenario(JSON.stringify(d)));assert(report.ok,JSON.stringify(report));assert.equal(d.start.routes.length,64);return {...load,routeCells:d.start.routes.reduce((n,r)=>n+r.cells.length,0),classes:[...new Set(d.start.routes.map(r=>r.kind))]};
}
