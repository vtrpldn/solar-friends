import init,{Game} from './pkg/solar_friends.js';
self.onmessage=async({data})=>{
 let game;
 try{
  if(!['map','release'].includes(data.kind)||typeof data.raw!=='string')throw Error('Choose a supported content package.');
  self.postMessage({stage:data.kind==='map'?'Checking your map…':'Checking your release…'});await init();game=new Game();
  const result=JSON.parse(data.kind==='map'?game.validate_map_package(data.raw):game.validate_scenario(data.raw));
  self.postMessage({result});
 }catch(error){self.postMessage({error:error.message||'This content package could not be checked.'});}
 finally{game?.free();}
};
