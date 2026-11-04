import init,{Game} from './pkg/solar_friends.js';

self.onmessage=async({data})=>{
 let game;
 try{
  self.postMessage({stage:'Loading the village simulation…'});
  await init();
  game=new Game();
  self.postMessage({stage:'Checking the land, residents and starting supplies…'});
  if(data.preflight){
   const required=JSON.parse(game.load_scenario(JSON.stringify(data.preflight)));
   if(!required.ok)throw Error(required.issues.find(issue=>issue.severity==='error')?.message||'This connection cannot be used.');
  }
  const checked=JSON.parse(game.load_scenario(JSON.stringify(data.definition)));
  if(!checked.ok&&data.allowInvalid){self.postMessage({validation:checked});return;}
  if(!checked.ok)throw Error(checked.issues.find(issue=>issue.severity==='error')?.message||'This creation cannot start.');
  self.postMessage({stage:'Preparing the opening village…'});
  self.postMessage({snapshot:game.snapshot(),validation:checked,report:JSON.parse(game.report_state())});
 }catch(error){self.postMessage({error:error.message||'This creation could not be prepared.'});}
 finally{game?.free();}
};
