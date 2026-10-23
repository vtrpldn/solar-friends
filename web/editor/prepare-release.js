import {runPreparation} from './run-preparation.js';
export function prepareRelease(definition,{workerFactory=()=>new Worker(new URL('../release-prepare-worker.js',import.meta.url),{type:'module'})}={}){
 return runPreparation({workerFactory,request:{definition},title:'Preparing your release',starting:'Starting separate release checks…',note:'You can cancel these checks before your draft is changed or a release is saved.',cancelMessage:'Release preparation cancelled. No release was saved.',failureMessage:'The release could not be prepared. Your draft is unchanged. Try again.',timeoutMessage:'Release preparation took too long. No release was saved. Try again.',result:data=>data.definition?data.definition:undefined});
}
