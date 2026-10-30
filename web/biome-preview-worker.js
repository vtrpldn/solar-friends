import init,{Game} from './pkg/solar_friends.js';
import {planBiomeChange} from './editor/biome-change.js';
self.onmessage=async({data})=>{
 let game;
 try{
  self.postMessage({stage:'Loading separate biome checks…'});await init();game=new Game();
  const catalog=JSON.parse(game.scenario_catalog());self.postMessage({stage:'Planning plants, soil and regional weather…'});
  const result=planBiomeChange(data.definition,catalog,data.options);
  self.postMessage({stage:'Checking the settlement against the proposed biome…'});
  const report=JSON.parse(game.load_scenario(JSON.stringify(result.candidate)));
  self.postMessage({result:{...result,report,snapshot:report.ok?JSON.parse(game.report_state()):null}});
 }catch(error){self.postMessage({error:error.message||'The biome preview could not be prepared.'});}
 finally{game?.free();}
};
