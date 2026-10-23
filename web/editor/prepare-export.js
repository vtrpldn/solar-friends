import {runPreparation} from './run-preparation.js';
export function prepareCreationExport(definition,context,{workerFactory=()=>new Worker(new URL('../creation-export-worker.js',import.meta.url),{type:'module'})}={}){
 return runPreparation({workerFactory,request:{definition,context},title:'Preparing your creation file',starting:'Preparing a separate export…',note:'Your draft stays unchanged. You can cancel before the download begins.',cancelMessage:'Export cancelled. Your draft is unchanged.',failureMessage:'The creation file could not be prepared. Your draft is unchanged. Try again.',timeoutMessage:'Export preparation took too long. Your draft is unchanged. Try again.',result:data=>typeof data.file==='string'?data.file:undefined});
}
