import {runPreparation} from './run-preparation.js';
export const storageResult=result=>typeof result?.ok==='boolean'&&(!result.ok||Array.isArray(result.locations))&&(!result.locations||Array.isArray(result.locations));
const workerFactory=()=>new Worker(new URL('../storage-query-worker.js',import.meta.url),{type:'module'});
// Lookups are read-only and cached by exact source. A closed or replaced panel
// cannot publish an older result into the current allocation controls.
export class StorageQuery{
 constructor(kind,update,{factory=workerFactory,timeoutMs=10000}={}){Object.assign(this,{kind,update,factory,timeoutMs});this.state={status:'idle'};}
 stop(){clearTimeout(this.timer);this.worker?.terminate();this.worker=null;}
 cancelPending(){if(this.state.status==='loading'){this.stop();this.raw=null;this.state={status:'idle'};}}
 retry(){this.stop();this.raw=null;this.state={status:'idle'};}
 read(raw){
  if(this.raw===raw)return this.state;
  this.stop();this.raw=raw;this.state={status:'loading'};
  try{
   const worker=this.worker=this.factory(),fail=()=>{if(this.worker!==worker)return;this.stop();this.state={status:'failed',message:'Starting storage could not be read. Try again.'};this.update();};
   worker.onmessage=({data})=>{if(this.worker!==worker)return;if(!storageResult(data?.result)){fail();return;}this.stop();this.state={status:'ready',result:data.result};this.update();};
   worker.onerror=e=>{e.preventDefault?.();fail();};worker.onmessageerror=fail;
   this.timer=setTimeout(fail,this.timeoutMs);worker.postMessage({kind:this.kind,raw,distribute:false});
  }catch{this.stop();this.state={status:'failed',message:'Starting storage could not be read. Try again.'};}
  return this.state;
 }
}
export function prepareStorage(kind,raw){
 return runPreparation({workerFactory,request:{kind,raw,distribute:true},title:'Preparing starting '+kind,starting:'Finding compatible storage without changing the village…',note:'Every unit keeps its material, food age or liquid class. You can cancel this preview.',cancelMessage:'Distribution preview cancelled. Your draft is unchanged.',failureMessage:'The storage preview could not be prepared. Your draft is unchanged.',timeoutMessage:'The storage preview took too long. Your draft is unchanged.',result:data=>storageResult(data.result)?data.result:undefined});
}
