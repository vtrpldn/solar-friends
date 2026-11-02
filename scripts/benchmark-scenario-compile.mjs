import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Session} from 'node:inspector';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'artifacts/scenario-compile-profile';await mkdir(output,{recursive:true});
const binding=pathToFileURL(resolve(process.argv.find(a=>a.startsWith('--binding='))?.slice(10)??'web/pkg/solar_friends.js'));
const {default:init,Game}=await import(binding.href),wasm=new URL('solar_friends_bg.wasm',binding),bytes=await readFile(wasm);await init({module_or_path:bytes});
const author=new Game();let definition,fixture;
try{const d=JSON.parse(author.scenario_template('sandbox'));d.map=JSON.parse(author.generate_biome_property('mata-atlantica',42));({definition,summary:fixture}=mixedBuilderFixture(author,d,{residentStyle:'sleep-mixed'}));}finally{author.free();}
const raw=JSON.stringify(definition);await writeFile(output+'/fixture.solar-scenario',raw);const game=new Game(),times=[];let expected;
try{
 for(let i=0;i<8;i++){const t=performance.now(),report=JSON.parse(game.load_scenario(raw));const elapsed=performance.now()-t;assert(report.ok);const snapshot=game.snapshot();expected??=snapshot;assert.equal(snapshot,expected);if(i>=3)times.push(elapsed);}
 const session=new Session();session.connect();const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
 let profile;try{await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');for(let i=0;i<12;i++)assert(JSON.parse(game.load_scenario(raw)).ok);({profile}=await post('Profiler.stop'));}finally{session.disconnect();}
 assert.equal(game.snapshot(),expected);await writeFile(output+'/compile.cpuprofile',JSON.stringify(profile));const hits=new Map();for(const node of profile.nodes){const key=(node.callFrame.functionName||'(anonymous)')+' '+node.callFrame.url;hits.set(key,(hits.get(key)||0)+(node.hitCount||0));}
 const result={complete:true,fixture,binding:fileURLToPath(binding),bindingSha256:createHash('sha256').update(await readFile(binding)).digest('hex'),wasmSha256:createHash('sha256').update(bytes).digest('hex'),fixtureSha256:createHash('sha256').update(raw).digest('hex'),snapshotSha256:createHash('sha256').update(expected).digest('hex'),scriptSha256:createHash('sha256').update(await readFile('scripts/benchmark-scenario-compile.mjs')).digest('hex'),warmSamplesMs:times,profiledCompiles:12,topSelfSamples:[...hits].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([name,hits])=>({name,hits})),scope:'Node native-WASM load_scenario CPU profile and five unprofiled warm compile samples. Identical opening snapshots checked across twenty compiles. Diagnostic named build when binding points outside web/pkg; not browser UI, cold art, cancellation, or release acceptance.'};await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({warmSamplesMs:times,topSelfSamples:result.topSelfSamples}));
}finally{game.free();}
