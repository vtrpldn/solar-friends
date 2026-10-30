import init,{Game} from './pkg/solar_friends.js';
self.onmessage=async({data})=>{
 let game;
 try{
  if(!Number.isInteger(data.seed)||data.seed<0||data.seed>4294967295||!['keep','generated','none'].includes(data.river))throw Error('Choose a whole seed from 0 to 4,294,967,295 and a supported river option.');
  self.postMessage({stage:'Preparing a separate landscape…'});await init();game=new Game();
  const original=data.definition,candidate=structuredClone(original),generated=JSON.parse(game.generate_biome_property(original.map.biome?.id??'mata-atlantica',data.seed));
  if(!generated)throw Error('This regional landscape is unavailable.');
  candidate.map={...generated,id:original.map.id,revision:original.map.revision,camp:original.map.camp,camera:original.map.camera,...(Object.hasOwn(original.map,'regions')?{regions:original.map.regions}:{})};
  if(data.keepClearings)candidate.map.clearings=original.map.clearings;
  if(data.river==='keep'){if(Object.hasOwn(original.map,'river'))candidate.map.river=original.map.river;else delete candidate.map.river;}
  if(data.river==='none')candidate.map.river=null;
  self.postMessage({stage:'Checking buildings, arrivals and connections against the new land…'});
  const report=JSON.parse(game.load_scenario(JSON.stringify(candidate)));
  self.postMessage({prepared:{candidate,report,snapshot:report.ok?JSON.parse(game.report_state()):null}});
 }catch(error){self.postMessage({error:error.message||'This landscape could not be prepared. Your draft is unchanged.'});}
 finally{game?.free();}
};
