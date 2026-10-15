import init,{Game} from './pkg/solar_friends.js';

self.onmessage=async({data})=>{
  let game;
  try {
    await init();
    game=new Game();
    if(!game.restore(data.checkpoint))throw new Error('The forecast checkpoint could not be restored.');
    const report=JSON.parse(game.project_forecast(data.days));
    if(report.error)throw new Error(report.error);
    self.postMessage({report});
  }catch(error){self.postMessage({error:String(error.message||error)});}
  finally{game?.free();}
};
