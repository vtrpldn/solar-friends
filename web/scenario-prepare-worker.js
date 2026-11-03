import init,{Game} from './pkg/solar_friends.js';

self.onmessage=async({data})=>{
 let game;
 try{
  self.postMessage({stage:'Loading the village simulation…'});
  await init();
  game=new Game();
  self.postMessage({stage:'Checking the land, residents and starting supplies…'});
  const checked=JSON.parse(game.load_scenario(JSON.stringify(data.definition)));
  if(!checked.ok)throw Error(checked.issues.find(issue=>issue.severity==='error')?.message||'This creation cannot start.');
  self.postMessage({stage:'Preparing the opening village…'});
  self.postMessage({snapshot:game.snapshot(),validation:checked,report:JSON.parse(game.report_state())});
 }catch(error){self.postMessage({error:error.message||'This creation could not be prepared.'});}
 finally{game?.free();}
};
