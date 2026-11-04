import init,{Game} from '../pkg/solar_friends.js';
import {recoveredDraft,recoveredVillage} from './record-recovery.js';
// Disposable read-only simulation: cancellation terminates all native work.
self.onmessage=async({data})=>{
 let game;
 try{
  self.postMessage({stage:'Loading the recovery checks…'});await init();
  if(!['project','run'].includes(data?.file?.kind))throw Error('Choose a draft or saved village backup.');
  if(data.file.kind==='project')game=new Game();
  const choices=[];
  for(const source of ['current','previous']){
   self.postMessage({stage:`Checking the ${source} checkpoint…`});
   try{const value=data.file.kind==='run'?recoveredVillage(data.file,Game,{source}):recoveredDraft(data.file,raw=>JSON.parse(game.validate_scenario(raw)),{source});choices.push({source,value});}
   catch(error){choices.push({source,error:error.message});}
  }
  self.postMessage({choices});
 }catch(error){self.postMessage({error:error.message||'The backup could not be checked.'});}
 finally{game?.free();}
};
