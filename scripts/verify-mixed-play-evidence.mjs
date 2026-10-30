import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';
const roots=process.argv.slice(2);assert(roots.length,'Pass one or more benchmark output directories');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});
const results=[];
for(const root of roots){
 const r=JSON.parse(await readFile(`${root}/report.json`)),bytes=await readFile(`${root}/fixture.solar-scenario`),definition=JSON.parse(bytes);
 assert.equal(r.completed,true);assert.deepEqual(r.browserErrors,[]);assert.equal(r.fixtureSha256,sha(bytes));
 assert.equal(r.benchmarkSha256,sha(await readFile('scripts/benchmark-mixed-play.mjs')));assert.equal(r.fixtureBuilderSha256,sha(await readFile('scripts/mixed-builder-fixture.mjs')));
 for(const [file,hash]of Object.entries(r.fetchedInputs))assert.equal(sha(await readFile(file)),hash,`${file}: measured source changed`);
 assert.equal(r.fixture.biome,definition.map.biome.id);
 const g=new Game();try{
  let residents,buildings;
  if(r.snapshotSource){const source=await readFile(`${root}/${r.snapshotSource.file}`);assert.equal(sha(source),r.snapshotSource.sha256);assert(g.restore(source.toString()));assert.equal(sha(g.snapshot()),r.snapshotSha256);const checkpoint=await readFile(`${root}/${r.snapshotSource.openingFile}`);assert.equal(sha(checkpoint),r.snapshotSha256);assert(g.restore(checkpoint.toString()));const state=JSON.parse(g.snapshot());residents=state.residents;buildings=state.village.buildings;assert.deepEqual(state.village.scenario.definition,definition);assert.equal(r.fixture.minute,state.village.minutes);}
  else {assert(JSON.parse(g.load_scenario(JSON.stringify(definition))).ok);residents=definition.start.residents;buildings=definition.start.buildings;}
  assert.equal(sha(g.snapshot()),r.snapshotSha256);assert.equal(r.fixture.population,residents.length);assert.equal(r.fixture.buildings,buildings.length);const unique=new Set(residents.map(p=>JSON.stringify(p.appearance))).size;assert.equal(r.fixture.uniqueAppearances,unique);if(r.fixture.sharedAppearances)assert.equal(unique,1);
 }finally{g.free();}
 assert.deepEqual(r.phases.map(p=>[p.speed,p.panning]),[[1,false],[1,true],[16,false],[16,true]]);
 const phases=[];
 for(const {speed,panning,runtime:s,checkpoint}of r.phases){
  assert.equal(checkpoint.residents,r.fixture.population);assert.equal(checkpoint.buildings,r.fixture.buildings);assert(s.wallSeconds>=r.secondsPerPhase);assert(s.advancedMinutes>0&&s.frames>0);
  assert([s.wallSeconds,s.advancedMinutes,s.medianGapMs,s.p95GapMs,s.maxGapMs,s.pauseClickWallMs].every(Number.isFinite));assert(s.medianGapMs<=s.p95GapMs&&s.p95GapMs<=s.maxGapMs);assert(panning?s.pointerMoves>0:s.pointerMoves===0);
  assert(Array.isArray(s.cacheSamples)&&s.cacheSamples.length>=2);assert.equal(s.cacheSamples[0].seconds,0);assert(s.cacheSamples.at(-1).seconds>=r.secondsPerPhase);for(let i=0;i<s.cacheSamples.length;i++){const c=s.cacheSamples[i];assert(c.entries<=s.cache.maxEntries&&c.queued<=s.cache.maxQueued);assert(Number.isFinite(c.retainedBytes)&&c.retainedBytes>=0);assert(c.jsHeapBytes===null||Number.isFinite(c.jsHeapBytes)&&c.jsHeapBytes>=0);if(i)assert(c.seconds>=s.cacheSamples[i-1].seconds);}
  assert(s.cache.entries<=s.cache.maxEntries);assert(s.cache.queued<=s.cache.maxQueued);assert.equal(s.cache.pending,0);
  assert((await readFile(`${root}/${speed}x-${panning?'pan':'still'}.png`)).length>10000);
  const effective=Object.entries(s.speedSeconds);assert(effective.length&&effective.every(([n,t])=>[speed,16].includes(Number(n))&&Number.isFinite(t)&&t>=0));assert(Math.abs(effective.reduce((n,[,t])=>n+t,0)-s.wallSeconds)<1e-6);assert(s.speedChanges.length&&s.speedChanges[0].seconds===0);const mixed=effective.some(([n,t])=>Number(n)!==speed&&t>0);
  phases.push({speed,panning,effectiveSpeedSeconds:s.speedSeconds,simulationRateFraction:mixed?null:s.advancedMinutes/(3*speed*s.wallSeconds),frameGapP95Ms:s.p95GapMs,paintP95Ms:s.meter.paint.p95,cacheBytes:s.cache.retainedBytes});
 }
 results.push({root,fixture:r.fixture,phases});
}
console.log(JSON.stringify({passed:true,scope:'Source-bound rendered measurements, native-valid fresh or established opening snapshot, bounded appearance cache, positive real simulation progress and exact checkpoint assertions completed by the benchmark. Timings are measurements, not acceptance of a universal budget or physical-display FPS.',results},null,2));
