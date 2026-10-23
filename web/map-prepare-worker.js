import init,{Game} from './pkg/solar_friends.js';
import {freezeCreation} from './editor/files.js';
import {prepareSharedMap,checkSharedMap,mapPreviewDefinition} from './editor/map-sharing.js';
self.onmessage=async({data})=>{
 let game;
 try{
  self.postMessage({stage:'Loading the map checks…'});await init();game=new Game();
  const catalog=JSON.parse(game.scenario_catalog()),template=JSON.parse(game.scenario_template('sandbox'));let resolved=null;
  if(data.valid){
   self.postMessage({stage:'Resolving the authored land…'});
   const checked=JSON.parse(game.load_scenario(JSON.stringify(data.definition)));
   if(!checked.ok)throw Error(checked.issues.find(issue=>issue.severity==='error')?.message||'This creation changed. Check it before saving a map.');
   resolved=freezeCreation(data.definition,{terrain:JSON.parse(game.terrain_template()),snapshot:JSON.parse(game.report_state()),catalog});
  }
  self.postMessage({stage:'Checking the land and climate…'});
  const prepared=prepareSharedMap(data.definition,{catalog,resolved,defaultMap:template.map}),validate=raw=>JSON.parse(game.validate_map_package(raw)),checked=checkSharedMap({...prepared,...data.metadata,validate});
  self.postMessage({stage:'Preparing the map preview…'});let preview=null;
  try{const definition=mapPreviewDefinition(checked,template,validate),loaded=JSON.parse(game.load_scenario(JSON.stringify(definition)));if(loaded.ok)preview={definition,report:JSON.parse(game.report_state())};}catch{/* A missing optional preview does not invalidate checked land. */}
  self.postMessage({prepared,checked,preview});
 }catch(error){self.postMessage({error:error.message||'This map could not be prepared.'});}
 finally{game?.free();}
};
