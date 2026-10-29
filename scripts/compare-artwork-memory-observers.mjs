import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {analyzeArtworkNativeMemory} from './analyze-artwork-native-memory.mjs';

export function compareArtworkMemoryObservers(control,positive){
 const a=control.report,b=positive.report;
 assert.equal(a.automation,'raw-CDP-without-Network-agent');assert.equal(b.automation,'raw-CDP-with-Network-agent');
 assert.equal(a.networkInspectionEnabled,false);assert.equal(b.networkInspectionEnabled,true);
 for(const key of ['build','cyclesPerCast','residents','rawExecutable'])assert.equal(a[key],b[key],'Observer controls differ: '+key);
 assert(a.rawExecutable,'Identify the exact browser executable');
 for(const key of ['platform','arch','cpu','browser'])assert.equal(a.environment[key],b.environment[key],'Observer environments differ: '+key);
 assert.deepEqual(a.inputs,b.inputs,'Observer controls must use identical source revisions');
 const renderer=(analysis,label)=>{const stage=analysis.stages.find(s=>s.label===label);assert(stage,'Missing observer stage: '+label);assert.equal(stage.renderers.length,1,'This comparison requires one measured renderer');const r=stage.renderers[0],partitionBytes=r.topLevel.partition_alloc?.sizeBytes;assert(Number.isSafeInteger(partitionBytes));assert(Number.isSafeInteger(r.privateFootprintBytes));return {partitionBytes,privateFootprintBytes:r.privateFootprintBytes};};
 const releases=(report,analysis)=>report.results.filter(r=>r.cast==='unique').map(r=>({cycle:r.cycle,...renderer(analysis,`unique-${r.cycle}-released-gc`)}));
 const normal=releases(a,control.analysis),observed=releases(b,positive.analysis),expected=Array.from({length:a.cyclesPerCast},(_,i)=>i+1);assert.deepEqual(normal.map(r=>r.cycle),expected);assert.deepEqual(observed.map(r=>r.cycle),expected);assert(normal.length>=2);
 const beforeDisable=renderer(positive.analysis,'after diagnostic browser cache clear'),afterDisable=renderer(positive.analysis,'after diagnostic Network disable');
 const delta=rows=>rows.at(-1).partitionBytes-rows[0].partitionBytes;
 return {build:a.build,residents:a.residents,cyclesPerCast:a.cyclesPerCast,rawExecutable:a.rawExecutable,browser:a.environment.browser,controlReleases:normal,networkObservedReleases:observed,beforeDisable,afterDisable,observedPartitionGrowthBytes:delta(observed),controlPartitionGrowthBytes:delta(normal),networkDisablePartitionDropBytes:beforeDisable.partitionBytes-afterDisable.partitionBytes,networkDisablePrivateFootprintDropBytes:beforeDisable.privateFootprintBytes-afterDisable.privateFootprintBytes,scope:'Matched-source, matched-executable isolated lifecycle observations. Network is the deliberate observer variable. These deltas are not a permanent memory plateau, a full-game memory limit or proof that all application allocations are leak-free.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [controlDir,positiveDir,output]=process.argv.slice(2);assert(controlDir&&positiveDir&&output);
 const load=async dir=>{
  const report=JSON.parse(await readFile(dir+'/report.json','utf8'));let raw;
  try{raw=gunzipSync(await readFile(dir+'/memory-trace.json.gz'),{maxOutputLength:128*1024*1024});}catch(error){if(error.code!=='ENOENT')throw error;raw=await readFile(dir+'/memory-trace.json');}
  assert.equal(createHash('sha256').update(raw).digest('hex'),report.nativeDumps.trace.sha256);
  return {report,analysis:analyzeArtworkNativeMemory(report,JSON.parse(raw))};
 };
 const result=compareArtworkMemoryObservers(await load(controlDir),await load(positiveDir));
 await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
