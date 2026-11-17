import assert from 'node:assert/strict';
import {createSandbox,placementError,plan,route,enableFastNavigation} from '../web/v02/weekend/simulation.js';
const s=createSandbox(42);
for(const [x,z] of [[40,39],[50,39],[60,39]])assert.equal(plan(s,'house',x,z),'');
const samples=[];
for(let pass=0;pass<5;pass++)for(const [x,z,blocked] of [[50,60,false],[40,41,true],[60,60,false]]){
 const start=performance.now(),error=placementError(s,'workshop',x,z);
 samples.push(performance.now()-start);
 assert.equal(!!error,blocked);
 if(blocked)assert.match(error,/access|entrance|occupies/);
}
enableFastNavigation(s);
for(const target of [{x:40.5,z:41},{x:50,z:40},{x:40,z:39},{x:30,z:40}]){
 assert.equal(!!route(s,s.stock,target,true),!!route(s,s.stock,target),'shared reachability agrees with physical routing');
}
samples.sort((a,b)=>a-b);
console.log(`PASS placement results and route agreement; ${samples.length} checks, median ${samples[7].toFixed(1)}ms, max ${samples.at(-1).toFixed(1)}ms (local timing, not a frame-rate claim)`);
