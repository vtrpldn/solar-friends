import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';

// Chrome trace scalars use hexadecimal strings, including values without 0x.
export function traceBytes(value){
 if(value===undefined)return null;
 assert(typeof value==='string'&&/^(?:0x)?[a-f0-9]+$/i.test(value),'Use a hexadecimal trace scalar');
 const bytes=BigInt(value.startsWith('0x')||value.startsWith('0X')?value:'0x'+value);
 assert(bytes<=BigInt(Number.MAX_SAFE_INTEGER),'Trace scalar exceeds precise byte accounting');
 return Number(bytes);
}

export function analyzeArtworkNativeMemory(report,trace){
 assert.equal(report.completed,true);assert.equal(report.nativeDumps?.enabled,true);
 const events=trace.traceEvents;assert(Array.isArray(events));
 const names=new Map(events.filter(e=>e.ph==='M'&&e.name==='process_name').map(e=>[e.pid,e.args?.name]));
 const stages=report.nativeDumps.requests.map(request=>{
  assert.equal(request.success,true,'Native dump request failed');
  const marker=id=>{const matches=events.filter(e=>e.name==='clock_sync'&&e.args?.sync_id===id);assert.equal(matches.length,1,'Missing or ambiguous native dump stage marker');assert(Number.isFinite(matches[0].ts));return matches[0].ts;};
  const before=marker(request.beforeMarker),after=marker(request.afterMarker);assert(before<after,'Native dump stage markers are reversed');
  const groups=new Map();
  // Trace-local dump IDs may differ from request GUIDs. Timestamp brackets
  // identify the requested stage; never infer it from a matching numeric ID.
  for(const event of events.filter(e=>e.ph==='v'&&e.ts>=before&&e.ts<=after&&e.args?.dumps)){
   const dump=event.args.dumps;assert.equal(dump.level_of_detail,'detailed');
   let group=groups.get(event.pid);if(!group){group={pid:event.pid,name:names.get(event.pid)??null,totals:null,allocators:{}};groups.set(event.pid,group);}
   if(dump.process_totals){assert.equal(group.totals,null,'Multiple process totals in one stage');group.totals=dump.process_totals;}
   for(const [key,value]of Object.entries(dump.allocators??{})){assert(!Object.hasOwn(group.allocators,key),'Duplicate allocator in one stage');group.allocators[key]=value;}
  }
  const renderers=[...groups.values()].filter(g=>g.name==='Renderer').map(group=>{
   const topLevel={};
   // Record independent roots; summing parent/child or overlapping allocators
   // would double-count memory. Missing attributes stay null, not zero.
   for(const [key,value]of Object.entries(group.allocators))if(!key.includes('/')){
    const scalar=name=>{const attr=value.attrs?.[name];if(attr===undefined)return null;assert.equal(attr.type,'scalar');assert.equal(attr.units,'bytes');return traceBytes(attr.value);};
    topLevel[key]={sizeBytes:scalar('size'),effectiveSizeBytes:scalar('effective_size')};
   }
   assert(Object.keys(topLevel).length,'Renderer dump has no allocator evidence');
   return {pid:group.pid,privateFootprintBytes:traceBytes(group.totals?.private_footprint_bytes),topLevel};
  });
  assert(renderers.length,'No renderer native dump in the requested stage');
  return {label:request.label,requestGuid:request.dumpGuid,markerRange:[before,after],renderers};
 });
 assert(stages.length>=3,'Measure baseline, active cast and release separately');
 return {stages,scope:'Chrome detailed native allocator observations bracketed by explicit clock markers. Roots are not additive totals. Omitted allocators are unreported, not proven zero. Private footprint, process RSS and JavaScript heap are different measurements. This does not establish an allocation leak, a permanent plateau, a full-game memory limit or release readiness.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [reportPath,tracePath,output]=process.argv.slice(2);assert(reportPath&&tracePath&&output,'Pass the completed report, raw trace and analysis output paths');
 const report=JSON.parse(await readFile(reportPath,'utf8')),encoded=await readFile(tracePath),raw=tracePath.endsWith('.gz')?gunzipSync(encoded,{maxOutputLength:128*1024*1024}):encoded,sha=createHash('sha256').update(raw).digest('hex');
 assert.equal(sha,report.nativeDumps?.trace?.sha256,'Native trace differs from its recorded source');
 const result={...analyzeArtworkNativeMemory(report,JSON.parse(raw)),traceSha256:sha};
 await writeFile(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.stages.map(s=>({label:s.label,renderers:s.renderers.map(r=>({pid:r.pid,privateFootprintBytes:r.privateFootprintBytes,canvas:r.topLevel.canvas??null,malloc:r.topLevel.malloc??null,partitionAlloc:r.topLevel.partition_alloc??null}))}))));
}
