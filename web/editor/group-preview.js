// Native preview runs away from pointer handlers. Only the latest cell may
// publish a result, and changing/cancelling the gesture releases its worker.
export class GroupPreview {
 constructor(update,{workerFactory=()=>new Worker(new URL('../group-preview-worker.js',import.meta.url),{type:'module'}),delay=80,timeoutMs=10000}={}){Object.assign(this,{update,workerFactory,delay,timeoutMs});this.serial=0;}
 clear(){clearTimeout(this.timer);clearTimeout(this.deadline);this.worker?.terminate();this.worker=null;this.context=null;this.inFlight=false;this.queued=null;this.key=null;this.failure=null;this.serial++;this.update(null);}
 observe(definition,mode,copy,ids,dx,dy,cells=null){
  const selection=ids.join('\0'),same=this.context?.definition===definition&&this.context.mode===mode&&this.context.copy===copy&&this.context.selection===selection;
  if(!same){this.clear();this.context={definition,mode,copy,selection};try{
   this.worker=this.workerFactory();const worker=this.worker;
   worker.onmessage=({data})=>{if(this.worker!==worker)return;this.inFlight=false;clearTimeout(this.deadline);if(data.serial===this.serial)this.update(data);this.flush();};
   worker.onerror=event=>{event.preventDefault?.();if(this.worker!==worker)return;this.fail('Preview unavailable · placement will still be checked.');};
   worker.onmessageerror=()=>{if(this.worker===worker)this.fail('Preview unavailable · placement will still be checked.');};
   worker.postMessage({context:{definition,mode,copy,ids}});
  }catch{this.fail('Preview unavailable · placement will still be checked.');return;}}
  if(!this.worker){this.update({unavailable:true,message:this.failure??'Preview unavailable · placement will still be checked.',dx,dy});return;}
  const key=dx+','+dy+(cells?'|'+cells.map(p=>p.join(',')).join(';'):'');if(this.key===key)return;this.key=key;const serial=++this.serial;clearTimeout(this.timer);this.queued={serial,dx,dy,...(cells?{cells}:{} )};this.update({pending:true,dx,dy});
  if(!this.worker)return;
  this.timer=setTimeout(()=>this.flush(),this.delay);
 }
 flush(){if(!this.worker||this.inFlight||!this.queued)return;const request=this.queued;this.queued=null;this.inFlight=true;try{this.worker.postMessage(request);this.deadline=setTimeout(()=>this.fail('Preview took too long · placement will still be checked.'),this.timeoutMs);}catch{this.fail('Preview unavailable · placement will still be checked.');}}
 fail(message){this.failure=message;clearTimeout(this.timer);clearTimeout(this.deadline);this.worker?.terminate();this.worker=null;this.serial++;this.update({unavailable:true,message});}
}
