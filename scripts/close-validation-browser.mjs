// Only for disposable validation servers/contexts, after observations finish.
// Stop background asset traffic before tearing down the browser. A shutdown
// timeout is a failed run, never permission to report a clean completion.
export async function closeValidationBrowser(browser,server,{timeoutMs=10000,onStage=()=>{}}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<1)throw Error('Choose a bounded validation shutdown timeout.');
 const bounded=async(operation,label)=>{let timer;const started=performance.now();onStage({stage:label,event:'start'});try{const result=await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`Validation ${label} shutdown timed out.`)),timeoutMs);})]);onStage({stage:label,event:'complete',elapsedMs:performance.now()-started});return result;}catch(error){onStage({stage:label,event:'failed',elapsedMs:performance.now()-started,error:String(error)});throw error;}finally{clearTimeout(timer);}};
 let failure;
 try{await bounded(()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();}),'server');}catch(error){failure=error;}
 if(browser){
  try{for(const context of browser.contexts())await bounded(()=>context.close(),'context');}catch(error){failure??=error;}
  try{await bounded(()=>browser.close(),'browser');}catch(error){failure??=error;}
 }
 if(failure)throw failure;
}
