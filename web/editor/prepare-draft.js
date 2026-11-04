import {EditorDocument} from './document.js';
import {draftImportIssue} from './draft-import.js';
import {runPreparation} from './run-preparation.js';
export function prepareDraft(checkpoint){
 return runPreparation({workerFactory:()=>new Worker(new URL('../scenario-prepare-worker.js',import.meta.url),{type:'module'}),request:{definition:checkpoint.definition,allowInvalid:true},title:'Opening your creation',starting:'Checking the saved village separately…',note:'Your current creation stays unchanged until the saved draft and undo history are ready. You can cancel.',cancelMessage:'Opening cancelled. Your creations are unchanged.',failureMessage:'This creation could not be opened. Your saved data is unchanged.',timeoutMessage:'Opening took too long. Your saved data is unchanged.',result:async(data,{signal,stage})=>{
  if(!data.validation)return;
  const issue=draftImportIssue(data.validation);if(issue)throw Error(issue.message);
  stage('Restoring undo and redo history…');
  const doc=await EditorDocument.restoreAsync(checkpoint,{signal});
  return {doc,validation:data.validation,snapshot:data.snapshot};
 }});
}
