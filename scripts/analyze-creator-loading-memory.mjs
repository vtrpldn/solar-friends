import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {analyzeArtworkNativeMemory} from './analyze-artwork-native-memory.mjs';
const loading=s=>!!s&&(s.editorBusy==='true'||s.residentLoading===true);

export function analyzeCreatorLoadingMemory(report,native){
 assert.equal(report.completed,true);assert.equal(report.networkInspectionEnabled,false);
 assert(Number.isInteger(report.loadingDumpMs)&&report.loadingDumpMs>=250&&report.loadingDumpMs<=2000);
 assert(Array.isArray(report.loadingObservations)&&report.loadingObservations.length>0,'No loading samples were captured');
 const samples=[],seen=new Set();
 for(const observation of report.loadingObservations){
  assert(!seen.has(observation.label),'Duplicate loading sample');seen.add(observation.label);assert.equal(observation.forcedGc,false,'Loading samples must not force collection');
  assert(Number.isFinite(observation.durationMs)&&observation.durationMs>=0);
  const throughout=loading(observation.before)&&loading(observation.after)&&observation.before.url===observation.after.url;assert.equal(observation.loadingBracketed,throughout,'Loading-state attribution disagrees');
  const matches=native.stages.filter(s=>s.label===observation.label);assert.equal(matches.length,1,'Missing or ambiguous loading dump');const stage=matches[0];assert.equal(stage.renderers.length,1,'Loading maximum needs an unambiguous renderer');
  const renderer=stage.renderers[0];const bytes=renderer.privateFootprintBytes;assert(bytes===null||Number.isSafeInteger(bytes)&&bytes>=0);
  samples.push({...observation,privateFootprintBytes:bytes,topLevel:renderer.topLevel});
 }
 const expected=report.runs.flatMap(r=>['open editor','start playtest','return editor'].map(phase=>`${r.cast}-${r.cycle} ${phase}`));assert.equal(new Set(expected).size,expected.length);
 for(const sample of samples)assert(expected.includes(sample.transition),'Unknown preparation transition');
 const transitions=expected.map(transition=>{
  const observed=samples.filter(s=>s.transition===transition),eligible=observed.filter(s=>s.loadingBracketed),known=eligible.filter(s=>s.privateFootprintBytes!==null),roots={};
  for(const sample of eligible)for(const [name,values]of Object.entries(sample.topLevel)){const bytes=values.sizeBytes;if(bytes!==null&&bytes!==undefined){assert(Number.isSafeInteger(bytes)&&bytes>=0);roots[name]=Math.max(roots[name]??0,bytes);}}
  const highest=known.reduce((best,s)=>!best||s.privateFootprintBytes>best.privateFootprintBytes?s:best,null);
  return {transition,samples:observed.length,loadingBracketed:eligible.length,missingPrivateFootprint:eligible.length-known.length,maximumObservedPrivateFootprintBytes:highest?.privateFootprintBytes??null,highestSample:highest?.label??null,independentRootSizeMaxima:roots};
 });
 assert(transitions.some(t=>t.loadingBracketed>0),'No dump was bracketed by actual loading states');
 return {transitions,sampleCount:samples.length,loadingBracketed:samples.filter(s=>s.loadingBracketed).length,scope:'Sampled native allocations bracketed by observed loading states, with no forced collection or Network inspection. Observed maxima are lower bounds on true peaks; separate allocator-root maxima are not additive and may occur at different times. Missing measurements remain unknown. Detailed tracing perturbs timing. This does not establish a release memory budget, full-process peak or all-cast/biome acceptance.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [reportPath,tracePath,output]=process.argv.slice(2);assert(reportPath&&tracePath&&output);const report=JSON.parse(await readFile(reportPath)),encoded=await readFile(tracePath),raw=tracePath.endsWith('.gz')?gunzipSync(encoded,{maxOutputLength:128*1024*1024}):encoded;
 assert.equal(createHash('sha256').update(raw).digest('hex'),report.nativeDumps.trace.sha256);const result=analyzeCreatorLoadingMemory(report,analyzeArtworkNativeMemory(report,JSON.parse(raw)));await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
