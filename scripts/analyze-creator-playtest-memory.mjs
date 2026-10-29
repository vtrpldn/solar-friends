import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {analyzeArtworkNativeMemory} from './analyze-artwork-native-memory.mjs';

export function analyzeCreatorPlaytestMemory(report,native){
 assert.equal(report.completed,true);assert.equal(report.networkInspectionEnabled,false);assert.equal(report.runs.length,report.cyclesPerCast*2);
 const stage=label=>{const rows=report.stages.filter(s=>s.label===label);assert.equal(rows.length,1,'Missing or ambiguous lifecycle stage');return rows[0];};
 const memory=label=>{const rows=native.stages.filter(s=>s.label===label);assert.equal(rows.length,1);assert.equal(rows[0].renderers.length,1);return rows[0].renderers[0];};
 const canvas=label=>{const bytes=memory(label).topLevel.canvas?.sizeBytes;assert(Number.isSafeInteger(bytes),'Canvas allocation evidence is missing');return bytes;};
 const rounds=[];
 for(const cast of ['shared','unique'])for(let cycle=1;cycle<=report.cyclesPerCast;cycle++){
  const runs=report.runs.filter(r=>r.cast===cast&&r.cycle===cycle);assert.equal(runs.length,1,'Each cast/cycle needs its own completed run');const run=runs[0],prefix=cast+'-'+cycle;
  assert.equal(run.initial.residents,report.fixture.population);assert.equal(run.initial.buildings,report.fixture.buildings);assert.equal(run.initial.uniqueAppearances,cast==='shared'?1:report.fixture.population);assert.equal(run.initial.artworkEntries,run.initial.uniqueAppearances);
  for(const key of ['draftPreserved','runRemoved','normalStoragePreserved'])assert.equal(run.returned[key],true,'Playtest isolation failed: '+key);
  assert.deepEqual(run.timings.map(t=>t.requestedSpeed),[1,8]);assert(run.timings.every(t=>t.advancedMinutes>0));
  const before=prefix+' editor ready',after=prefix+' returned editor';assert.deepEqual(stage(after).dom,stage(before).dom,'Returning to the same editor must restore its DOM/listener counts');assert.equal(canvas(after),canvas(before),'Returning to the same editor retained additional canvas allocations');
  rounds.push({cast,cycle,dom:stage(after).dom,editorCanvasBytes:canvas(after),returnedPrivateFootprintBytes:memory(after).privateFootprintBytes,playtestPrivateFootprintBytes:memory(prefix+' playtest ran').privateFootprintBytes});
 }
 const first='empty creator baseline',last='empty creator terminal';assert.equal(stage(first).dom.documents,stage(last).dom.documents);assert.equal(stage(first).dom.jsEventListeners,stage(last).dom.jsEventListeners);assert.equal(canvas(first),canvas(last),'Leaving the project retained additional native canvas allocations');
 return {rounds,emptyCreator:{baselineCanvasBytes:canvas(first),terminalCanvasBytes:canvas(last),baselinePrivateFootprintBytes:memory(first).privateFootprintBytes,terminalPrivateFootprintBytes:memory(last).privateFootprintBytes},scope:'Exact observed DOM/listener and native canvas round trips for these short editor/playtest cycles. The final library contains the two authored fixture entries, so its total DOM-node count can differ from the initial empty collection. Private footprint is recorded separately; this does not prove a permanent memory plateau, asynchronous-loading peak, 16x performance, all-biome coverage or a release memory budget.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [reportPath,tracePath,output]=process.argv.slice(2);assert(reportPath&&tracePath&&output);
 const report=JSON.parse(await readFile(reportPath,'utf8')),encoded=await readFile(tracePath),raw=tracePath.endsWith('.gz')?gunzipSync(encoded,{maxOutputLength:128*1024*1024}):encoded;
 assert.equal(createHash('sha256').update(raw).digest('hex'),report.nativeDumps.trace.sha256);
 const result=analyzeCreatorPlaytestMemory(report,analyzeArtworkNativeMemory(report,JSON.parse(raw)));await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
