import init,{Game} from './pkg/solar_friends.js';
import {freezeReleaseDefinition} from './release-package.js';
self.onmessage=async({data})=>{
 let game;
 try{
  self.postMessage({stage:'Loading the release checks…'});await init();game=new Game();
  self.postMessage({stage:'Checking land, residents and starting supplies…'});
  const checked=JSON.parse(game.load_scenario(JSON.stringify(data.definition)));
  if(!checked.ok)throw Error(checked.issues.find(issue=>issue.severity==='error')?.message||'This creation cannot be released.');
  self.postMessage({stage:'Freezing the landscape and weather…'});
  const definition=freezeReleaseDefinition(data.definition,{terrain:JSON.parse(game.terrain_template()),snapshot:JSON.parse(game.report_state()),catalog:JSON.parse(game.scenario_catalog())});
  const frozen=JSON.parse(game.validate_scenario(JSON.stringify(definition)));
  if(!frozen.ok)throw Error(frozen.issues.find(issue=>issue.severity==='error')?.message||'This frozen creation cannot be released.');
  self.postMessage({definition});
 }catch(error){self.postMessage({error:error.message||'This release could not be prepared.'});}
 finally{game?.free();}
};
