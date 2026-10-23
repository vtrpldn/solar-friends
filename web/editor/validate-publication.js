// The library awaits this exact-package check before opening its write transaction.
export function validatePublication(kind,raw,{signal,onStage=()=>{},workerFactory=()=>new Worker(new URL('../publication-validation-worker.js',import.meta.url),{type:'module'})}={}){
 return new Promise((resolve,reject)=>{
  let worker,timer,settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();if(error)reject(error);else resolve(result);};
  const abort=()=>finish(signal.reason??new DOMException('Publication cancelled.','AbortError'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  try{
   worker=workerFactory();worker.onmessage=({data})=>{if(settled)return;try{if(data.error)finish(Error(data.error));else if(data.result&&typeof data.result.ok==='boolean')finish(null,data.result);else if(data.stage)onStage(data.stage);}catch(error){finish(error);}};
   worker.onerror=event=>{event.preventDefault();finish(Error('The content package could not be checked. No package was saved.'));};
   worker.postMessage({kind,raw});if(!settled)timer=setTimeout(()=>finish(Error('The package check took too long. No package was saved.')),60000);
  }catch(error){finish(error);}
 });
}
