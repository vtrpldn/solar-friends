import init,{Game} from '../web/pkg/solar_friends.js';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {makeScenario} from '../web/dev/scenarios.js';
await init({module_or_path:await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game();g.start_mode('story');const fresh=JSON.parse(g.snapshot());assert(g.restore(await fs.readFile('web/artwork/village-preview.json','utf8')),'Benchmark fixture must restore');const established=JSON.parse(g.snapshot());
const results=[];
for(const scene of ['arrival','village','autonomy']){
 assert(g.restore(JSON.stringify(makeScenario(scene,fresh,established))),`Restore ${scene}`);
 const saved=g.snapshot(),map=JSON.parse(saved).village.map_size;
 const tick=[],snapshot=[],frame=[];
 for(let i=0;i<300;i++){let t=performance.now();g.tick(.25);tick.push(performance.now()-t);t=performance.now();g.snapshot();snapshot.push(performance.now()-t);if(g.frame_state){t=performance.now();g.frame_state();frame.push(performance.now()-t);}}
 const summary=a=>{a.sort((x,y)=>x-y);return {median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)],total:a.reduce((x,y)=>x+y,0)};};
 results.push({scene,map,snapshotBytes:saved.length,tick:summary(tick),snapshot:summary(snapshot),...(frame.length?{frame:summary(frame),frameBytes:g.frame_state().length}:{})});
}
console.log(JSON.stringify({engine:'wasm',results},null,2));g.free();
