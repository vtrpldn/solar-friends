import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzeCreatorPlaytestMemory} from './analyze-creator-playtest-memory.mjs';
const [reportPath,nativePath]=process.argv.slice(2);assert(reportPath&&nativePath,'Pass the completed lifecycle report and native analysis');
const report=JSON.parse(await readFile(reportPath,'utf8')),native=JSON.parse(await readFile(nativePath,'utf8'));analyzeCreatorPlaytestMemory(report,native);
const returned=report.stages.find(s=>s.label.endsWith('returned editor')).label;
for(const mutate of [
 (r,n)=>{n.stages.find(s=>s.label===returned).renderers[0].topLevel.canvas.sizeBytes+=4;},
 r=>{r.stages.find(s=>s.label===returned).dom.documents++;},
 r=>{r.stages.find(s=>s.label===returned).dom.jsEventListeners++;},
 r=>{r.runs[0].returned.draftPreserved=false;},
 r=>{r.runs[0].returned.runRemoved=false;},
 r=>{r.runs[0].timings[0].advancedMinutes=0;},
 r=>{r.runs.pop();},
 r=>{r.runs[1].cycle=r.runs[0].cycle;},
 r=>{r.networkInspectionEnabled=true;},
 (r,n)=>{delete n.stages.find(s=>s.label===returned).renderers[0].topLevel.canvas;},
]){const broken=structuredClone(report),allocations=structuredClone(native);mutate(broken,allocations);assert.throws(()=>analyzeCreatorPlaytestMemory(broken,allocations));}
// Exact canvas recovery is not evidence of a total native memory budget.
const larger=structuredClone(native);larger.stages.find(s=>s.label===returned).renderers[0].privateFootprintBytes*=2;
assert.equal(analyzeCreatorPlaytestMemory(report,larger).rounds[0].returnedPrivateFootprintBytes,larger.stages.find(s=>s.label===returned).renderers[0].privateFootprintBytes);
console.log('PASS real lifecycle evidence; added canvas/document/listener retention, lost draft/run isolation, stalled simulation, missing/duplicate cycles and network-observed evidence refused; private footprint stays a separate observation.');
