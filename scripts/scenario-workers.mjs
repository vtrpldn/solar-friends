// Runs independent scenarios of one verify script on worker threads.
//
//   if(isMainThread)await runScenarios(import.meta.url,['a','b']);else await scenario(workerData);
//
// Each worker re-imports the calling script with one scenario name as `workerData`, so every scenario
// keeps its own module state. Output is replayed in scenario order once each scenario ends, and the
// first failing scenario's error (an assertion, usually) is rethrown after all of them have finished.
import {Worker} from 'node:worker_threads';

export async function runScenarios(script,names){
  const runs=await Promise.all(names.map(name=>new Promise(resolve=>{
    const worker=new Worker(new URL(script),{workerData:name,stdout:true,stderr:true});
    let log='',error=null;
    worker.stdout.on('data',data=>log+=data);worker.stderr.on('data',data=>log+=data);
    worker.on('error',e=>{error=e;});
    worker.on('exit',code=>resolve({name,log,error:error??(code?new Error(`scenario ${name} exited with code ${code}`):null)}));
  })));
  for(const run of runs)process.stdout.write(run.log);
  const failed=runs.find(run=>run.error);
  if(failed){console.error(`Scenario ${failed.name} failed`);throw failed.error;}
}
