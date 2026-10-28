import assert from 'node:assert/strict';
import {prepareResidentArtwork} from '../web/resident-artwork-preparation.js';
import {createAppearanceCache} from '../web/appearance-cache.js';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(){
 let pinned=new Set(['old-0','old-1','old-2','old-3']);const jobs=[],cache=createAppearanceCache({maxEntries:4,maxConcurrent:2,isPinned:key=>pinned.has(key),compose:input=>new Promise((resolve,reject)=>jobs.push({input,resolve,reject}))});
 let installs=0;const library={prepare:input=>cache.get(input.key,input),installPrepared(inputs,providers){installs++;const previous=pinned;pinned=new Set(inputs.map(p=>p.key));const undo=cache.install(inputs.map((p,i)=>[p.key,providers[i]]));return ()=>{if(!undo())return false;pinned=previous;return true;};}};
 cache.install([...pinned].map(key=>[key,{key}]));return {cache,jobs,library,installs:()=>installs};
}
const appearances=Array.from({length:4},(_,i)=>({key:'new-'+i}));
{
 const f=fixture(),controller=new AbortController(),progress=[],pending=prepareResidentArtwork(appearances,f.library,{signal:controller.signal,onProgress:p=>progress.push(p)});await flush();assert.equal(f.jobs.length,2);controller.abort();await assert.rejects(pending,{name:'AbortError'});for(const job of f.jobs)job.resolve({key:job.input.key});await flush();assert.equal(f.jobs.length,2);assert.equal(f.installs(),0);assert.equal(progress.length,1);for(let i=0;i<4;i++)assert.equal(f.cache.peek('old-'+i).key,'old-'+i);
}
{
 const f=fixture(),inputs=structuredClone(appearances),progress=[],pending=prepareResidentArtwork(inputs,f.library,{onProgress:p=>progress.push(p.completed)});inputs[2].key='mutated';await flush();f.jobs[0].resolve({key:'new-0'});f.jobs[1].resolve({key:'new-1'});await flush();assert.equal(f.jobs.length,4);for(let i=0;i<4;i++)assert(f.cache.peek('old-'+i));assert.equal(f.jobs[2].input.key,'new-2');f.jobs[2].resolve({key:'new-2'});f.jobs[3].resolve({key:'new-3'});const undo=await pending;assert.deepEqual(progress,[0,1,2,3,4]);assert.equal(f.installs(),1);for(let i=0;i<4;i++)assert.equal(f.cache.peek('new-'+i).key,'new-'+i);assert(undo());assert(!undo());for(let i=0;i<4;i++)assert(f.cache.peek('old-'+i));
}
{
 const f=fixture(),pending=prepareResidentArtwork(appearances,f.library);await flush();f.jobs[0].reject(Error('decode failed'));await assert.rejects(pending,/decode failed/);f.jobs[1].resolve({key:'new-1'});await flush();assert.equal(f.installs(),0);assert.equal(f.jobs.length,2);for(let i=0;i<4;i++)assert(f.cache.peek('old-'+i));
}
{
 const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(prepareResidentArtwork(appearances,f.library,{signal:controller.signal}),{name:'AbortError'});assert.equal(f.jobs.length,0);
 const before=f.cache.info().entries;assert.throws(()=>f.cache.install([['x',{}],['x',{}]]));assert.equal(f.cache.info().entries,before);assert.throws(()=>f.cache.install([['unprotected',{}]]),/protected/);for(let i=0;i<4;i++)assert(f.cache.peek('old-'+i));
 const old=f.cache.install([]),latest=f.cache.install([]);assert(!old());assert(latest());const stale=f.cache.install([]);f.cache.clear();assert(!stale());
}
console.log('PASS: bounded two-worker staging, cancellation, late completion isolation, progress, immutable inputs, failure rollback, exact active-cast retention, atomic installation and stale rollback refusal.');
