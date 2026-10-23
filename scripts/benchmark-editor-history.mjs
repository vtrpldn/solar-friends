import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir,cpus} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {EditorDocument} from '../web/editor/document.js';

const output=process.argv[2]??'/tmp/solar-editor-history';
const baseline=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice(11);
const initial={format:'solar-friends-scenario',schema:1,title:'History stress',description:'A'.repeat(62000),map:{id:'history-map'},start:{},rules:{}};
const percentile=(samples,p)=>[...samples].sort((a,b)=>a-b)[Math.floor((samples.length-1)*p)];
const measure=Constructor=>{
  const doc=new Constructor(initial),times=[];
  for(let n=0;n<80;n++){
    const start=performance.now();
    doc.transact('Replace long description '+n,d=>{d.description=String.fromCharCode(66+n%24).repeat(62000);});
    if(n>=64)times.push(performance.now()-start);
  }
  const checkpoint=doc.checkpoint(),historyBytes=Buffer.byteLength(JSON.stringify(checkpoint.history));
  assert.equal(checkpoint.history.past.length,64);assert(historyBytes>7.5*1024*1024&&historyBytes<8*1024*1024);
  const final=doc.value;
  for(let n=0;n<64;n++)assert(doc.undo());assert(!doc.undo());
  for(let n=0;n<64;n++)assert(doc.redo());assert(!doc.redo());assert.deepEqual(doc.value,final);
  const reopened=Constructor.restore(checkpoint);assert(!reopened.historyRecovered);assert.deepEqual(reopened.value,final);
  // Reusing and then altering external checkpoint objects must never reuse a
  // cached validation size or leak ownership into the live journal.
  checkpoint.history.past[0].label='X'.repeat(200);
  const corrupt=Constructor.restore(checkpoint);assert(corrupt.historyRecovered);assert.deepEqual(corrupt.value,final);
  assert.equal(reopened.undoLabel,'Replace long description 79');assert(reopened.undo());assert(reopened.redo());
  const branch=Constructor.restore(doc.checkpoint());branch.undo();branch.transact('Branch',d=>{d.title='Independent branch';});assert(!branch.canRedo);
  const byteLimited=new Constructor({...initial,description:'A'.repeat(70000)});
  for(let n=0;n<70;n++)byteLimited.transact('Large edit '+n,d=>{d.description=String.fromCharCode(66+n%24).repeat(70000);});
  const limited=byteLimited.checkpoint();assert(limited.history.past.length<64);
  const limitedBytes=Buffer.byteLength(JSON.stringify(limited.history));assert(limitedBytes<8*1024*1024&&limitedBytes>7.5*1024*1024);
  const checked=Constructor.restore(limited);assert(!checked.historyRecovered);assert.deepEqual(checked.value,byteLimited.value);
  for(let n=0;n<limited.history.past.length;n++)assert(checked.undo());assert(!checked.undo());
  for(let n=0;n<limited.history.past.length;n++)assert(checked.redo());assert.deepEqual(checked.value,limited.definition);
  return {historyBytes,retainedSteps:64,byteLimitedHistoryBytes:limitedBytes,byteLimitedSteps:limited.history.past.length,finalCheckpointSha256:createHash('sha256').update(JSON.stringify(doc.checkpoint())).digest('hex'),measuredEdits:times.length,medianMs:percentile(times,.5),p95Ms:percentile(times,.95),samplesMs:times};
};
let temporary;
try{
  const results={};
  if(baseline){
    temporary=await mkdtemp(join(tmpdir(),'solar-history-baseline-'));
    await writeFile(join(temporary,'package.json'),'{"type":"module"}');
    await cp(baseline,join(temporary,'document.js'));await cp(new URL('../web/editor/journal.js',import.meta.url),join(temporary,'journal.js'));
    results.baseline=measure((await import(pathToFileURL(join(temporary,'document.js')))).EditorDocument);
    results.baselineSourceSha256=createHash('sha256').update(await readFile(baseline)).digest('hex');
  }
  results.current=measure(EditorDocument);
  if(results.baseline)assert.equal(results.current.finalCheckpointSha256,results.baseline.finalCheckpointSha256);
  const source=await readFile(new URL('../web/editor/document.js',import.meta.url));
  const report={scope:'Node journal-edit CPU measurement with a near-8-MiB retained history. Synthetic draft; not native scenario validation, browser save latency, or total memory acceptance.',cpu:cpus()[0]?.model,sourceSha256:createHash('sha256').update(source).digest('hex'),...results};
  await mkdir(output,{recursive:true});await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(temporary)await rm(temporary,{recursive:true,force:true});}
