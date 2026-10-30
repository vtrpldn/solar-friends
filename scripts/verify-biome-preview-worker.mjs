import assert from 'node:assert/strict';
import {prepareBiomePreview} from '../web/editor/prepare-biome-preview.js';

const fixture=()=>{
 const worker={terminated:0,sent:[],terminate(){this.terminated++;},postMessage(value){this.sent.push(value);}};
 return {worker,start:options=>prepareBiomePreview({map:{}},{target:'cerrado'},{workerFactory:()=>worker,...options})};
};
{
 const {worker,start}=fixture(),stages=[],promise=start({onStage:s=>stages.push(s)});
 worker.onmessage({data:{stage:'Checking'}});worker.onmessage({data:{result:{report:{ok:true}}}});
 assert.deepEqual(await promise,{report:{ok:true}});assert.deepEqual(stages,['Checking']);assert.equal(worker.terminated,1);
 worker.onmessage({data:{stage:'Late'}});assert.deepEqual(stages,['Checking']);assert.equal(worker.sent.length,1);
}
{
 const {worker,start}=fixture(),controller=new AbortController(),promise=start({signal:controller.signal});
 controller.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(worker.terminated,1);
 worker.onmessage({data:{result:{stale:true}}});assert.equal(worker.terminated,1);
}
{
 const controller=new AbortController();controller.abort();let created=0;
 await assert.rejects(prepareBiomePreview({}, {},{signal:controller.signal,workerFactory:()=>{created++;}}),{name:'AbortError'});assert.equal(created,0);
}
{
 const controller=new AbortController(),worker={terminate(){this.terminated=true;}};
 await assert.rejects(prepareBiomePreview({}, {},{signal:controller.signal,workerFactory:()=>{controller.abort();return worker;}}),{name:'AbortError'});assert.equal(worker.terminated,true);
}
for(const kind of ['error','messageerror','invalid','stage-error','timeout','post-error']){
 const {worker,start}=fixture();if(kind==='post-error')worker.postMessage=()=>{throw Error('Cannot send');};
 const promise=start({timeoutMs:kind==='timeout'?5:1000,onStage:()=>{throw Error('Cannot display stage');}});
 if(kind==='error')worker.onerror({preventDefault(){}});
 if(kind==='messageerror')worker.onmessageerror();
 if(kind==='invalid')worker.onmessage({data:{}});
 if(kind==='stage-error')worker.onmessage({data:{stage:'Checking'}});
 await assert.rejects(promise);assert.equal(worker.terminated,1,kind);
}
console.log('PASS biome preview worker ownership, completion, abort, pre-abort, constructor-time abort, late responses, timeout, malformed messages, delivery and callback failures.');
