// A cancelled worker result must never reach an installation or download step.
export function runPreparation({workerFactory,request,title,starting,note,cancelMessage,failureMessage,timeoutMessage,result}){
 return new Promise((resolve,reject)=>{
  const dialog=document.createElement('dialog');dialog.className='creator-prepare-dialog';dialog.setAttribute('aria-labelledby','creator-prepare-title');
  const heading=document.createElement('h2');heading.id='creator-prepare-title';heading.textContent=title;
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent=starting;
  const explanation=document.createElement('p');explanation.textContent=note;
  const button=document.createElement('button');button.type='button';button.textContent='Cancel preparation';dialog.append(heading,status,explanation,button);
  const previousFocus=document.activeElement;let worker,settled=false,timer;
  const finish=(error,value)=>{
   if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();dialog.close();dialog.remove();
   if(previousFocus?.isConnected)previousFocus.focus();if(error)reject(error);else resolve(value);
  };
  const cancel=()=>finish(new DOMException(cancelMessage,'AbortError'));
  dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});button.onclick=cancel;
  document.body.append(dialog);dialog.showModal();
  try{
   worker=workerFactory();worker.onmessage=({data})=>{
    if(settled)return;
    try{if(data.error){finish(Error(data.error));return;}const value=result(data);if(value!==undefined){finish(null,value);return;}if(data.stage)status.textContent=data.stage;}catch(error){finish(error);}
   };
   worker.onerror=event=>{event.preventDefault();finish(Error(failureMessage));};worker.postMessage(request);
   if(!settled)timer=setTimeout(()=>finish(Error(timeoutMessage)),60000);
  }catch(error){finish(error);}
 });
}
