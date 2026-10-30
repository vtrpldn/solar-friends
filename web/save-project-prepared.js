// Prepared editor snapshots use serialized transport so IndexedDB object copying
// happens in the worker. Completion is metadata, never a second large checkpoint.
export function savePreparedProjectBytes(name,raw,expectedRevision,{workerFactory=()=>new Worker(new URL('./project-save-worker.js',import.meta.url),{type:'module'}),timeoutMs=60000,receipt=crypto.randomUUID()}={}){
 return new Promise((resolve,reject)=>{
  let worker,timer,finished=false;
  const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);if(worker){worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();}if(error)reject(error);else resolve(value);};
  try{
   if(typeof raw!=='string'||raw.length>96*1024*1024||typeof name!=='string'||!name.length||name.length>256||typeof receipt!=='string'||!receipt.length||receipt.length>96)throw Error('This prepared draft cannot be saved.');
   worker=workerFactory();
   worker.onerror=event=>{event.preventDefault?.();finish(Error('The save worker stopped. Your recovery copy remains available.'));};
   worker.onmessageerror=()=>finish(Error('The save acknowledgement could not be read. Your recovery copy remains available.'));
   worker.onmessage=({data})=>{if(data?.error){const error=Error(data.error);error.name=data.conflict?'LibraryConflict':'Error';finish(error);}else if(data?.saved&&typeof data.saved.id==='string'&&data.saved.revision===(expectedRevision??0)+1&&data.saved.saveReceipt===receipt)finish(null,data.saved);else finish(Error('The save acknowledgement is invalid. Your recovery copy remains available.'));};
   timer=setTimeout(()=>finish(Error('Saving took too long. Check the saved creation before retrying; your recovery copy remains available.')),timeoutMs);
   worker.postMessage({name,raw,expectedRevision,receipt});
  }catch(error){finish(error);}
 });
}
