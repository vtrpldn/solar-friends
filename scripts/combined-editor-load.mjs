import assert from 'node:assert/strict';
import {plantStroke} from '../web/editor/nature.js';
// Stress content only: native-valid maximum authored nature/routes on top of
// the building-limit fixture, not a balanced village or generation preset.
export function addCombinedEditorLoad(game,definition,catalog,{preserveRoutes=false}={}){
 const species=catalog.nature.find(s=>s.key==='macambira');assert(species);
 const cells=[];for(let y=1;y<63;y++)for(let x=1;x<63;x++)cells.push([x,y]);
 let id=0;definition.map.nature=plantStroke(definition,[],catalog.nature,species.key,species.min_size,cells,1,()=>`load-nature-${id++}`);
 assert.equal(definition.map.nature.length,1000,'Combined fixture must hit the authored nature limit');
 if(!preserveRoutes)definition.start.routes=[];
 const endpoints=JSON.parse(game.scenario_utility_endpoints(JSON.stringify(definition),'electricity'));assert(endpoints.allowed);
 const pairs=endpoints.endpoints.filter(e=>e.supply&&e.ready).flatMap(a=>endpoints.endpoints.filter(b=>b.receive&&b.ready&&b.reference.id!==a.reference.id).map(b=>({a,b,distance:Math.abs(a.x-b.x)+Math.abs(a.y-b.y)}))).sort((a,b)=>a.distance-b.distance);
 let attempted=0;
 for(const {a,b} of pairs){
  if(definition.start.routes.length===catalog.routes.limit)break;attempted++;
  const p=JSON.parse(game.scenario_route_preview(JSON.stringify(definition),'electricity',JSON.stringify(a.reference),JSON.stringify(b.reference)));if(!p.allowed)continue;
  definition.start.routes.push({id:`load-route-${definition.start.routes.length}`,kind:'electricity',from:a.reference,to:b.reference,state:'completed',cells:p.cells});
 }
 assert.equal(definition.start.routes.length,catalog.routes.limit,'Combined fixture must hit the utility route limit');
 const report=JSON.parse(game.validate_scenario(JSON.stringify(definition)));assert(report.ok,JSON.stringify(report));
 return {authoredNature:definition.map.nature.length,species:species.key,size:species.min_size,routes:definition.start.routes.length,routeCells:definition.start.routes.reduce((n,r)=>n+r.cells.length,0),routeAttempts:attempted};
}
