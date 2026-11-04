import init,{Game} from './pkg/solar_friends.js';
self.onmessage=async({data})=>{
 let game;
 try{await init();game=new Game();self.postMessage({result:JSON.parse(game.scenario_equipment(data.raw))});}
 catch{self.postMessage({error:true});}
 finally{game?.free();}
};
