// A cancelled worker result must never reach an installation or download step.
export function runPreparation({workerFactory,request,title,starting,note,cancelMessage,failureMessage,timeoutMessage,result,timeoutMs=60000}){
 return new Promise((resolve,reject)=>{
  const dialog=document.createElement('dialog');dialog.className='creator-prepare-dialog';dialog.setAttribute('aria-labelledby','creator-prepare-title');
  const heading=document.createElement('h2');heading.id='creator-prepare-title';heading.textContent=title;
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent=starting;
  const explanation=document.createElement('p');explanation.textContent=note;
  const button=document.createElement('button');button.type='button';button.textContent='Cancel preparation';dialog.append(heading,status,explanation,button);
  const previousFocus=document.activeElement,controller=new AbortController();let worker,settled=false,timer;
  const finish=(error,value)=>{
   if(settled)return;settled=true;if(error)controller.abort(error);clearTimeout(timer);worker?.terminate();dialog.close();dialog.remove();
   if(previousFocus?.isConnected)previousFocus.focus();if(error)reject(error);else resolve(value);
  };
  const cancel=()=>finish(new DOMException(cancelMessage,'AbortError'));
  dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});button.onclick=cancel;
  document.body.append(dialog);dialog.showModal();
  try{
   worker=workerFactory();if(settled){worker.terminate();return;}worker.onmessage=async({data})=>{
    if(settled)return;
    try{if(!data||typeof data!=='object')throw Error(failureMessage);if(data.error){finish(Error(data.error));return;}const value=await result(data,{signal:controller.signal,stage:message=>{if(!settled)status.textContent=message;}});if(settled)return;if(value!==undefined){finish(null,value);return;}if(typeof data.stage==='string')status.textContent=data.stage;else finish(Error(failureMessage));}catch(error){finish(error);}
   };
   worker.onerror=event=>{event.preventDefault?.();finish(Error(failureMessage));};
   worker.onmessageerror=()=>finish(Error(failureMessage));
   timer=setTimeout(()=>finish(Error(timeoutMessage)),timeoutMs);worker.postMessage(request);
  }catch(error){finish(error);}
 });
}
