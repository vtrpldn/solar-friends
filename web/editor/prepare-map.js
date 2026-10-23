import {runPreparation} from './run-preparation.js';
export function prepareMap(request,{workerFactory=()=>new Worker(new URL('../map-prepare-worker.js',import.meta.url),{type:'module'})}={}){
 return runPreparation({workerFactory,request,title:'Preparing your map',starting:'Starting separate land checks…',note:'You can cancel these checks before your draft is changed or a map is saved.',cancelMessage:'Map preparation cancelled. No map was saved.',failureMessage:'The map could not be prepared. Your draft is unchanged. Try again.',timeoutMessage:'Map preparation took too long. No map was saved. Try again.',result:data=>data.prepared?{prepared:data.prepared,checked:data.checked,preview:data.preview}:undefined});
}
