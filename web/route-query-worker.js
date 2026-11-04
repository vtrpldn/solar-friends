import init,{Game} from './pkg/solar_friends.js';
self.onmessage=async({data})=>{
 let game;
 try{
  await init();game=new Game();let result;
  if(data.mode==='endpoints')result=JSON.parse(game.scenario_utility_endpoints(data.raw,data.kind));
  else if(data.mode==='shortest')result=JSON.parse(game.scenario_route_preview(data.raw,data.kind,data.from,data.to));
  else if(data.mode==='check'){
   const report=JSON.parse(game.load_scenario(data.raw));
   if(!report.ok)result={allowed:false,reason:report.issues.find(i=>i.severity==='error')?.message??'This corridor cannot be used.'};
   else{
    const v=JSON.parse(game.snapshot()).village,line=v.pipes.lines.find(p=>p.id===v.scenario.routes[data.id]);
    if(!line)throw Error('The proposed connection could not be found.');
    result={allowed:true,...line.plan,kit:Object.fromEntries(line.kit.map((n,i)=>[data.materials[i],n]).filter(([,n])=>n>0))};
   }
  }else throw Error('Unknown connection preview.');
  self.postMessage({result});
 }catch{self.postMessage({error:'The connection preview could not be prepared. Your draft is unchanged.'});}
 finally{game?.free();}
};
