import {creationFile,freezeCreation} from './editor/files.js';
self.onmessage=({data})=>{
 try{
  self.postMessage({stage:'Resolving the landscape for this file…'});
  const definition=data.context?freezeCreation(data.definition,data.context):data.definition;
  self.postMessage({stage:'Writing the creation file…'});
  self.postMessage({file:creationFile(definition)});
 }catch(error){self.postMessage({error:error.message||'This creation file could not be prepared.'});}
};
