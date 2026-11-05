import {runPreparation} from './run-preparation.js';
// A fresh compilation supplies lighting only; never install or tick this world.
export function prepareNightInspection(source){
 const definition = structuredClone(source);
 definition.start.minutes = Math.floor(source.start.minutes / 1440) * 1440 + 1320;
 if (definition.start.minutes > 5_000_000) {
  return Promise.reject(Error('22:00 falls beyond the supported calendar on this opening day.'));
 }
 return runPreparation({workerFactory:()=>new Worker(new URL('../scenario-prepare-worker.js',import.meta.url),{type:'module'}),request:{definition},title:'Inspecting a night view',starting:'Checking the opening lights in a separate village…',note:'This previews 22:00 with the authored starting charge and power rules. Time, crops, food and residents in your draft stay unchanged. You can cancel.',cancelMessage:'Night inspection cancelled. Your creation is unchanged.',failureMessage:'The night view could not be checked. Your creation is unchanged.',timeoutMessage:'The night view took too long. Your creation is unchanged.',result:data=>data.validation?.ok&&data.report?{power:data.report.environment.power}:undefined});
}
