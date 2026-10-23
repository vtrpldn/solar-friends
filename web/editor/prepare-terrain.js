// One request owns one worker. Superseded work is terminated, not queued behind
// an obsolete full-size paint. Late transferred bitmaps are always released.
export function prepareTerrain(request,{signal,workerFactory=()=>new Worker(new URL('../terrain-paint-worker.js',import.meta.url),{type:'module'}),timeoutMs=30000}={}){
 return new Promise((resolve,reject)=>{
  let worker,timer,settled=false;
  const finish=(error,bitmap)=>{
   if(settled){bitmap?.close?.();return;}
   settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();
   if(error){bitmap?.close?.();reject(error);}else resolve(bitmap);
  };
  const abort=()=>finish(signal.reason??new DOMException('Landscape painting cancelled.','AbortError'));
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  try{
   worker=workerFactory();if(settled){worker.terminate();return;}
   worker.onmessage=({data})=>{
    if(!data||typeof data!=='object'){finish(Error('The landscape painter returned an invalid response.'));return;}
    if(data.error){finish(Error(data.error),data.bitmap);return;}
    if(!data.bitmap||data.bitmap.width!==4096||data.bitmap.height!==4096){finish(Error('The landscape painter returned an invalid image.'),data.bitmap);return;}
    finish(null,data.bitmap);
   };
   worker.onerror=event=>{event.preventDefault?.();finish(Error('The landscape painter could not start. Edit the land to retry.'));};
   worker.onmessageerror=()=>finish(Error('The landscape image could not be received.'));
   timer=setTimeout(()=>finish(Error('Landscape painting took too long. Edit the land to retry.')),timeoutMs);
   worker.postMessage(request);
  }catch(error){finish(error);}
 });
}
