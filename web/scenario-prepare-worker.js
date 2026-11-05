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
  let layoutIndex,checked;
  if(data.buildingLayouts){
   const definition=data.definition;
   for(const [index,buildings] of data.buildingLayouts.entries()){
    definition.start.buildings=buildings;
    checked=JSON.parse(game.load_scenario(JSON.stringify(definition)));
    if(checked.ok&&!checked.issues.some(issue=>issue.code==='opening_building_access')){
     layoutIndex=index;
     break;
    }
    if(!checked.ok&&!checked.issues.some(issue=>issue.code==='invalid_placement'))break;
    self.postMessage({stage:'Checking another layout around the arrival camp…'});
   }
   if(layoutIndex===undefined)throw Error('The standard shed and storage could not both fit on reachable plots near this camp.');
  }else{
   checked=JSON.parse(game.load_scenario(JSON.stringify(data.definition)));
  }
  if(!checked.ok&&data.allowInvalid){self.postMessage({validation:checked});return;}
  if(!checked.ok)throw Error(checked.issues.find(issue=>issue.severity==='error')?.message||'This creation cannot start.');
  self.postMessage({stage:'Preparing the opening village…'});
  self.postMessage({snapshot:game.snapshot(),validation:checked,report:JSON.parse(game.report_state()),layoutIndex});
 }catch(error){self.postMessage({error:error.message||'This creation could not be prepared.'});}
 finally{game?.free();}
};
