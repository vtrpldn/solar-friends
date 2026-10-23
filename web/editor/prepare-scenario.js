// Preparation owns a disposable simulation. Cancellation never installs a run.
export function prepareScenario(definition,{workerFactory=()=>new Worker(new URL('../scenario-prepare-worker.js',import.meta.url),{type:'module'})}={}){
 return new Promise((resolve,reject)=>{
  const dialog=document.createElement('dialog');
  dialog.className='creator-prepare-dialog';
  dialog.setAttribute('aria-labelledby','creator-prepare-title');
  dialog.innerHTML='<h2 id="creator-prepare-title">Preparing your village</h2><p role="status">Starting a separate simulation…</p><p>Your creation stays unchanged. You can cancel before a village is saved.</p><button type="button">Cancel preparation</button>';
  const previousFocus=document.activeElement;
  let worker,settled=false,timer;
  const finish=(error,result)=>{
   if(settled)return;settled=true;
   clearTimeout(timer);worker?.terminate();dialog.close();dialog.remove();
   if(previousFocus?.isConnected)previousFocus.focus();
   if(error)reject(error);else resolve(result);
  };
  const cancel=()=>finish(new DOMException('Village preparation cancelled. Your draft is unchanged.','AbortError'));
  dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
  dialog.querySelector('button').onclick=cancel;
  document.body.append(dialog);dialog.showModal();
  try{
   worker=workerFactory();
   worker.onmessage=({data})=>{
    if(settled)return;
    if(data.error){finish(Error(data.error));return;}
    if(data.snapshot){finish(null,{snapshot:data.snapshot,report:data.report});return;}
    if(data.stage)dialog.querySelector('[role=status]').textContent=data.stage;
   };
   worker.onerror=event=>{event.preventDefault();finish(Error('The village could not be prepared. Your creation is unchanged. Try again.'));};
   worker.postMessage({definition});
   timer=setTimeout(()=>finish(Error('Preparation took too long. Your creation is unchanged. Try again or simplify the starting village.')),60000);
  }catch(error){finish(error);}
 });
}
