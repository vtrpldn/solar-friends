// Only for disposable validation servers/contexts, after observations finish.
// Stop background asset traffic before tearing down the browser. A shutdown
// timeout is a failed run, never permission to report a clean completion.
export async function closeValidationBrowser(browser,server,{timeoutMs=10000}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<1)throw Error('Choose a bounded validation shutdown timeout.');
 await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});
 if(!browser)return;
 const bounded=async(operation,label)=>{let timer;try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`Validation ${label} shutdown timed out.`)),timeoutMs);})]);}finally{clearTimeout(timer);}};
 let failure;
 try{for(const context of browser.contexts())await bounded(()=>context.close(),'context');}catch(error){failure=error;}
 try{await bounded(()=>browser.close(),'browser');}catch(error){failure??=error;}
 if(failure)throw failure;
}
