import assert from 'node:assert/strict';
import {analyzeArtworkNativeMemory,traceBytes} from './analyze-artwork-native-memory.mjs';
const scalar=value=>({type:'scalar',units:'bytes',value});
const requests=Array.from({length:3},(_,i)=>({label:['baseline','active','released'][i],success:true,dumpGuid:'0x'+(i+100).toString(16),beforeMarker:`stage-${i}-before`,afterMarker:`stage-${i}-after`}));
const events=[{ph:'M',name:'process_name',pid:42,args:{name:'Renderer'}}];
for(let i=0;i<3;i++){
 events.push({name:'clock_sync',ts:i*10,args:{sync_id:requests[i].beforeMarker}},{name:'clock_sync',ts:i*10+9,args:{sync_id:requests[i].afterMarker}});
 const dump={level_of_detail:'detailed',process_totals:{private_footprint_bytes:['10','100','20'][i]}};
 events.push({ph:'v',pid:42,id:'0x'+i,ts:i*10+1,args:{dumps:dump}});
 const allocators={malloc:{attrs:{size:scalar('10')}},'malloc/child':{attrs:{size:scalar('f')}}};
 if(i===1)allocators.canvas={attrs:{size:scalar('80')}};
 events.push({ph:'v',pid:42,id:'0x'+i,ts:i*10+1,args:{dumps:{level_of_detail:'detailed',allocators}}});
}
const report={completed:true,nativeDumps:{enabled:true,requests}},trace={traceEvents:events},result=analyzeArtworkNativeMemory(report,trace);
assert.deepEqual(result.stages.map(s=>s.renderers[0].privateFootprintBytes),[16,256,32],'Rewritten dump IDs must not retarget stage attribution');
assert.equal(result.stages[1].renderers[0].topLevel.canvas.sizeBytes,128);
assert.equal(result.stages[2].renderers[0].topLevel.canvas,undefined,'Omitted canvas evidence must not become zero');
assert.equal(result.stages[0].renderers[0].topLevel.malloc.effectiveSizeBytes,null);
assert.deepEqual(Object.keys(result.stages[0].renderers[0].topLevel),['malloc'],'Do not add child allocation sizes to their root');
assert.equal(traceBytes(undefined),null);assert.equal(traceBytes('0'),0);assert.equal(traceBytes('0XFF'),255);
for(const bad of ['',16,'xyz','-10','20000000000000'])assert.throws(()=>traceBytes(bad));
for(const mutate of [
 t=>t.traceEvents.splice(t.traceEvents.findIndex(e=>e.args?.sync_id==='stage-1-before'),1),
 t=>t.traceEvents.push(structuredClone(t.traceEvents.find(e=>e.args?.sync_id==='stage-1-before'))),
 t=>t.traceEvents.find(e=>e.args?.sync_id==='stage-1-after').ts=10,
 t=>{t.traceEvents=t.traceEvents.filter(e=>!(e.ph==='v'&&e.ts===11));},
 t=>t.traceEvents.find(e=>e.args?.dumps?.allocators).args.dumps.allocators.malloc.attrs.size.units='objects',
 t=>t.traceEvents.push(structuredClone(t.traceEvents.find(e=>e.args?.dumps?.allocators))),
]){const broken=structuredClone(trace);mutate(broken);assert.throws(()=>analyzeArtworkNativeMemory(report,broken));}
const failed=structuredClone(report);failed.nativeDumps.requests[1].success=false;assert.throws(()=>analyzeArtworkNativeMemory(failed,trace));
const threadOnly=structuredClone(trace);threadOnly.traceEvents=threadOnly.traceEvents.filter(e=>e.name!=='process_name');threadOnly.traceEvents.push({ph:'M',name:'thread_name',pid:42,args:{name:'CrRendererMain'}});
assert.equal(analyzeArtworkNativeMemory(report,threadOnly).stages[0].renderers[0].identityEvidence,'trace-renderer-main-thread');
const unrelated=structuredClone(threadOnly);unrelated.traceEvents.at(-1).args.name='Compositor';assert.throws(()=>analyzeArtworkNativeMemory(report,unrelated),'A generic thread cannot identify an unnamed process as the renderer');
const conflicting=structuredClone(threadOnly);conflicting.traceEvents.push({ph:'M',name:'process_name',pid:42,args:{name:'Browser'}});assert.throws(()=>analyzeArtworkNativeMemory(report,conflicting),'Do not override a different explicit process identity');
console.log('PASS native stage attribution despite rewritten GUIDs; roots stay separate; omissions stay unknown; malformed, missing, duplicate and failed dump evidence refused.');
