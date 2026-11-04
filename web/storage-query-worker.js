import init,{Game} from './pkg/solar_friends.js';
self.onmessage=async({data})=>{
 let game;
 try{
  if(!['supplies','liquids'].includes(data?.kind))throw Error('Unknown storage setup.');
  await init();game=new Game();
  self.postMessage({result:JSON.parse(game['scenario_'+data.kind](data.raw,data.distribute===true))});
 }catch{self.postMessage({error:'The storage preview could not be prepared. Your draft is unchanged.'});}
 finally{game?.free();}
};
