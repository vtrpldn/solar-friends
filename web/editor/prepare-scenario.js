import {runPreparation} from './run-preparation.js';
// Preparation owns a disposable simulation. Cancellation never installs a run.
export function prepareScenario(definition,{workerFactory=()=>new Worker(new URL('../scenario-prepare-worker.js',import.meta.url),{type:'module'})}={}){
 return runPreparation({workerFactory,request:{definition},title:'Preparing your village',starting:'Starting a separate simulation…',note:'Your creation stays unchanged. You can cancel before a village is saved.',cancelMessage:'Village preparation cancelled. Your draft is unchanged.',failureMessage:'The village could not be prepared. Your creation is unchanged. Try again.',timeoutMessage:'Preparation took too long. Your creation is unchanged. Try again or simplify the starting village.',result:data=>data.snapshot?{snapshot:data.snapshot,report:data.report}:undefined});
}
