import assert from 'node:assert/strict';
import {EditorDocument} from '../web/editor/document.js';
const d=new EditorDocument({format:'solar-friends-scenario',schema:1,id:'original',revision:3,title:'Original',map:{id:'map-original',revision:3},start:{},rules:{}});
for(let n=1;n<=80;n++)d.transact('Title '+n,v=>{v.title='Stage '+n;});
for(let n=0;n<7;n++)d.undo();
const cp=d.checkpoint(),before=structuredClone(cp),sync=EditorDocument.fork(cp,'separate');let count=0;
const asyncDoc=await EditorDocument.forkAsync(cp,'separate',{yieldControl:async()=>{count++;}});
assert.deepEqual(asyncDoc.checkpoint(),sync.checkpoint());assert(count>250);
for(let n=0;n<57;n++){assert(asyncDoc.undo());assert(sync.undo());assert.deepEqual(asyncDoc.value,sync.value);assert.equal(asyncDoc.value.id,'separate');assert.equal(asyncDoc.value.map.id,'map-separate');}
for(let n=0;n<64;n++){assert(asyncDoc.redo());assert(sync.redo());assert.deepEqual(asyncDoc.value,sync.value);}
for(const at of [1,130,150,195,220,280]){const controller=new AbortController();let n=0;await assert.rejects(EditorDocument.forkAsync(cp,'cancelled',{signal:controller.signal,yieldControl:async()=>{if(++n===at)controller.abort(new DOMException('Cancelled','AbortError'));}}),{name:'AbortError'});assert.deepEqual(cp,before);}
const broken=structuredClone(cp);broken.history.past[0].label='';const recovered=await EditorDocument.forkAsync(broken,'recovered');assert(recovered.historyRecovered);assert(!recovered.canUndo);assert.equal(recovered.value.title,cp.definition.title);
await assert.rejects(EditorDocument.forkAsync(cp,''),/identity/);
await assert.rejects(EditorDocument.forkAsync(cp,'failed',{yieldControl:async()=>{throw Error('Failed yield');}}),/Failed yield/);
assert.deepEqual(cp,before);
console.log('PASS cooperative fork exact sync parity, past/future replay, independent identity, cancellation across restore/rebind/checkpoint/revalidation, corrupt-history recovery and source isolation.');
