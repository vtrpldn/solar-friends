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
 assert.equal(r.fixture.biome,definition.map.biome.id);assert.equal(r.fixture.population,definition.start.residents.length);assert.equal(r.fixture.buildings,definition.start.buildings.length);
 const unique=new Set(definition.start.residents.map(p=>JSON.stringify(p.appearance))).size;assert.equal(r.fixture.uniqueAppearances,unique);if(r.fixture.sharedAppearances)assert.equal(unique,1);
 const g=new Game();try{assert(JSON.parse(g.load_scenario(JSON.stringify(definition))).ok);assert.equal(sha(g.snapshot()),r.snapshotSha256);}finally{g.free();}
 assert.deepEqual(r.phases.map(p=>[p.speed,p.panning]),[[1,false],[1,true],[16,false],[16,true]]);
 const phases=[];
 for(const {speed,panning,runtime:s,checkpoint}of r.phases){
  assert.equal(checkpoint.residents,r.fixture.population);assert.equal(checkpoint.buildings,r.fixture.buildings);assert(s.wallSeconds>=r.secondsPerPhase);assert(s.advancedMinutes>0&&s.frames>0);
  assert([s.wallSeconds,s.advancedMinutes,s.medianGapMs,s.p95GapMs,s.maxGapMs,s.pauseClickWallMs].every(Number.isFinite));assert(s.medianGapMs<=s.p95GapMs&&s.p95GapMs<=s.maxGapMs);assert(panning?s.pointerMoves>0:s.pointerMoves===0);
  assert(s.cache.entries<=s.cache.maxEntries);assert(s.cache.queued<=s.cache.maxQueued);assert.equal(s.cache.pending,0);
  assert((await readFile(`${root}/${speed}x-${panning?'pan':'still'}.png`)).length>10000);
  phases.push({speed,panning,simulationRateFraction:s.advancedMinutes/(3*speed*s.wallSeconds),frameGapP95Ms:s.p95GapMs,paintP95Ms:s.meter.paint.p95,cacheBytes:s.cache.retainedBytes});
 }
 results.push({root,fixture:r.fixture,phases});
}
console.log(JSON.stringify({passed:true,scope:'Source-bound stress measurements, native-valid opening snapshot, bounded appearance cache, positive real simulation progress and exact checkpoint assertions completed by the benchmark. Timings are measurements, not acceptance of a universal budget or physical-display FPS.',results},null,2));
