import assert from 'node:assert/strict';
export function wornPumpFixture(game,{extraFeeds=false}={}){
 const d=JSON.parse(game.scenario_template('sandbox'));d.map.river=null;d.rules.maintenance=true;d.start.automatic_service=false;
 for(const [kind,id,x,y]of [['well','pump-source',25,28],['kitchen','pump-destination',25,25],['solar_farm','pump-power',28,25],['workshop','worn-line',20,28]])d.start.buildings.push({id,kind,x,y,state:'completed',recipe:'standard',appearance:null});
 d.start.routes=[];
 for(const [id,kind,from,to]of [['worn-line','fresh',{kind:'building',id:'pump-source'},{kind:'building',id:'pump-destination'}],['pump-cable','electricity',{kind:'building',id:'pump-power'},{kind:'pump',id:'worn-line'}]]){
  const p=JSON.parse(game.scenario_route_preview(JSON.stringify(d),kind,JSON.stringify(from),JSON.stringify(to)));assert(p.allowed,p.reason);d.start.routes.push({id,kind,from,to,state:'completed',cells:p.cells});
 }
 if(extraFeeds)for(const source of ['pump-source','pump-destination']){const from={kind:'building',id:source},to={kind:'pump',id:'worn-line'},p=JSON.parse(game.scenario_route_preview(JSON.stringify(d),'electricity',JSON.stringify(from),JSON.stringify(to)));assert(p.allowed,p.reason);d.start.routes.push({id:'feed-'+source,kind:'electricity',from,to,state:'completed',cells:p.cells});}
 d.start.equipment=[{asset:{kind:'pump',id:'worn-line'},condition:37,defer_automatic:true},{asset:{kind:'workshop',id:'worn-line'},condition:63,defer_automatic:false},{asset:{kind:'truck'},condition:81,defer_automatic:true}];
 const report=JSON.parse(game.validate_scenario(JSON.stringify(d)));assert(report.ok,JSON.stringify(report));return d;
}
