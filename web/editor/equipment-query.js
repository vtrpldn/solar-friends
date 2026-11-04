// One disposable lookup per source revision. Closing or replacing the source
// terminates pending work; old workers cannot publish into a newer inspector.
export class EquipmentQuery {
 constructor(update,{workerFactory=()=>new Worker(new URL('../equipment-query-worker.js',import.meta.url),{type:'module'}),timeoutMs=10000}={}){Object.assign(this,{update,workerFactory,timeoutMs});this.state={status:'idle'};}
 stop(){clearTimeout(this.timer);this.worker?.terminate();this.worker=null;}
 cancelPending(){if(this.state.status==='loading'){this.stop();this.raw=null;this.state={status:'idle'};}}
 retry(){this.stop();this.raw=null;this.state={status:'idle'};}
 read(raw){
  if(this.raw===raw)return this.state;
  this.stop();this.raw=raw;this.state={status:'loading'};
  try{
   const worker=this.worker=this.workerFactory();
   const fail=()=>{if(this.worker!==worker)return;this.stop();this.state={status:'failed',message:'Opening equipment could not be read. Try again.'};this.update();};
   worker.onmessage=({data})=>{if(this.worker!==worker)return;const result=data?.result;if(typeof result?.allowed!=='boolean'||result.allowed&&!Array.isArray(result.equipment)){fail();return;}this.stop();this.state={status:'ready',result};this.update();};
   worker.onerror=e=>{e.preventDefault?.();fail();};worker.onmessageerror=fail;
   this.timer=setTimeout(fail,this.timeoutMs);worker.postMessage({raw});
  }catch{this.stop();this.state={status:'failed',message:'Opening equipment could not be read. Try again.'};}
  return this.state;
 }
}
