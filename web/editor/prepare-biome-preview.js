// A single inline preview owns its worker; a newer choice aborts older work.
export function prepareBiomePreview(definition,options,{signal,onStage=()=>{},workerFactory=()=>new Worker(new URL('../biome-preview-worker.js',import.meta.url),{type:'module'}),timeoutMs=60000}={}){
 return new Promise((resolve,reject)=>{
  let worker,timer,settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();if(error)reject(error);else resolve(value);};
  const abort=()=>finish(signal.reason??new DOMException('Biome preview cancelled.','AbortError'));
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  try{
   worker=workerFactory();if(settled){worker.terminate();return;}
   worker.onmessage=({data})=>{if(settled)return;try{if(data?.error){finish(Error(data.error));return;}if(data?.result){finish(null,data.result);return;}if(typeof data?.stage==='string')onStage(data.stage);else finish(Error('The biome preview returned an invalid response.'));}catch(error){finish(error);}};
   worker.onerror=e=>{e.preventDefault?.();finish(Error('The biome preview could not start. Refresh the preview to retry.'));};
   worker.onmessageerror=()=>finish(Error('The biome preview could not be received. Refresh the preview to retry.'));
   timer=setTimeout(()=>finish(Error('Biome preview took too long. Refresh the preview to retry.')),timeoutMs);worker.postMessage({definition,options});
  }catch(error){finish(error);}
 });
}
