import {runPreparation} from './run-preparation.js';
const workerFactory=()=>new Worker(new URL('../route-query-worker.js',import.meta.url),{type:'module'});
export class RouteQuery{
 constructor(update,{factory=workerFactory,timeoutMs=10000}={}){Object.assign(this,{update,factory,timeoutMs});this.state={status:'idle'};}
 stop(){clearTimeout(this.timer);this.worker?.terminate();this.worker=null;}
 cancelPending(){if(this.state.status==='loading'){this.stop();this.raw=null;this.state={status:'idle'};}}
 retry(){this.stop();this.raw=null;this.state={status:'idle'};}
 read(raw,kind){
  if(this.raw===raw&&this.kind===kind)return this.state;
  this.stop();this.raw=raw;this.kind=kind;this.state={status:'loading'};
  try{
   const worker=this.worker=this.factory(),fail=()=>{if(this.worker!==worker)return;this.stop();this.state={status:'failed',message:'Connection ports could not be read. Try again.'};this.update();};
   worker.onmessage=({data})=>{if(this.worker!==worker)return;const result=data?.result;if(typeof result?.allowed!=='boolean'||result.allowed&&!Array.isArray(result.endpoints)){fail();return;}this.stop();this.state={status:'ready',result};this.update();};
   worker.onerror=e=>{e.preventDefault?.();fail();};worker.onmessageerror=fail;this.timer=setTimeout(fail,this.timeoutMs);worker.postMessage({mode:'endpoints',raw,kind});
  }catch{this.stop();this.state={status:'failed',message:'Connection ports could not be read. Try again.'};}
  return this.state;
 }
}
export function prepareRoute(request){
 return runPreparation({workerFactory,request,title:request.mode==='shortest'?'Finding this connection':'Checking this connection',starting:'Checking compatible ports and the proposed corridor…',note:'This prepares a preview. Your draft stays unchanged until you save the connection.',cancelMessage:'Connection preview cancelled. Your draft is unchanged.',failureMessage:'The connection preview could not be prepared. Your draft is unchanged.',timeoutMessage:'The connection preview took too long. Your draft is unchanged.',result:data=>typeof data.result?.allowed==='boolean'&&(!data.result.allowed||Array.isArray(data.result.cells)&&data.result.kit)?data.result:undefined});
}
