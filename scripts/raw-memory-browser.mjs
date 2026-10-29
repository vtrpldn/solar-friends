// Isolated diagnostic Chromium driver. Page/Runtime only by default.
// The optional Network domain is a positive control for observer-owned buffers.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export async function launchRawMemoryBrowser(executable){
 const profile=await mkdtemp(join(tmpdir(),'solar-memory-cdp-'));
 const child=spawn(executable,['--headless','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--use-mock-keychain','--password-store=basic','--no-startup-window'],{stdio:['ignore','ignore','pipe']});
 let socket,closed=false;
 const exit=new Promise(resolve=>child.once('exit',resolve));
 const stop=async()=>{if(closed)return;closed=true;socket?.close();if(child.pid&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await Promise.race([exit,new Promise(resolve=>setTimeout(resolve,3000))]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit;}}await rm(profile,{recursive:true,force:true});};
 try{
  const address=await new Promise((resolve,reject)=>{
   let stderr='';const timeout=setTimeout(()=>reject(Error('Diagnostic Chromium did not expose its local debugging socket')),15000);
   const data=chunk=>{stderr=(stderr+chunk).slice(-16384);const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);child.stderr.off('data',data);resolve(match[1]);}};
   child.stderr.on('data',data);child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',()=>{clearTimeout(timeout);reject(Error('Diagnostic Chromium exited before readiness'));});
  });
  socket=new WebSocket(address);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let id=0;const pending=new Map(),listeners=new Map(),key=(session,method)=>(session??'root')+':'+method;
  socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data);
   if(message.id){const call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timeout);if(message.error)call.reject(Error(call.method+': '+message.error.message));else call.resolve(message.result);}
   else for(const listener of [...(listeners.get(key(message.sessionId,message.method))??[])])listener(message.params);
  });
  socket.addEventListener('close',()=>{for(const call of pending.values()){clearTimeout(call.timeout);call.reject(Error('Diagnostic browser connection closed'));}pending.clear();});
  const session=sessionId=>({
   send(method,params={}){return new Promise((resolve,reject)=>{const call=++id,timeout=setTimeout(()=>{pending.delete(call);reject(Error('Diagnostic CDP timed out: '+method));},30000);pending.set(call,{resolve,reject,timeout,method});try{socket.send(JSON.stringify({id:call,method,params,...(sessionId?{sessionId}:{})}));}catch(error){clearTimeout(timeout);pending.delete(call);reject(error);}});},
   on(method,listener){const k=key(sessionId,method);if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(listener);},
   once(method,listener){const k=key(sessionId,method),wrapped=params=>{listeners.get(k)?.delete(wrapped);listener(params);};this.on(method,wrapped);},
  });
  const root=session(),version=await root.send('Browser.getVersion');
  return {
   version:()=>version.product,newBrowserCDPSession:async()=>root,close:stop,
   async newPage({viewport,networkAgent=false}){
    const {targetId}=await root.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await root.send('Target.attachToTarget',{targetId,flatten:true}),page=session(sessionId);
    const {targetInfos}=await root.send('Target.getTargets');for(const target of targetInfos)if(target.type==='page'&&target.targetId!==targetId)await root.send('Target.closeTarget',{targetId:target.targetId});
    await page.send('Page.enable');await page.send('Runtime.enable');if(networkAgent)await page.send('Network.enable');await page.send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});
    return {
     on(name,listener){if(name!=='pageerror')throw Error('Unsupported diagnostic event');page.on('Runtime.exceptionThrown',event=>listener(Error(event.exceptionDetails.exception?.description??event.exceptionDetails.text)));},
     context:()=>({newCDPSession:async()=>page}),
     async goto(url){let timer;const loaded=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Diagnostic page load timed out')),30000);page.once('Page.loadEventFired',resolve);});try{const result=await page.send('Page.navigate',{url});if(result.errorText)throw Error(result.errorText);await loaded;}finally{clearTimeout(timer);}},
     async evaluate(fn,arg){const result=await page.send('Runtime.evaluate',{expression:`(${fn.toString()})(${arg===undefined?'undefined':JSON.stringify(arg)})`,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;},
    };
   },
  };
 }catch(error){await stop();throw error;}
}
