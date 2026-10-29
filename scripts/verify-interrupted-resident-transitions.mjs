import assert from 'node:assert/strict';
import {advanceResidentAnimation, presentedPoseLayers, residentClips} from '../web/resident-animation.js';
const person={id:0,x:10,y:10,target_x:10,target_y:10};
const inputs={walk:{task:'idle',target_x:11},work:{task:'build'},cook:{task:'cook'},water:{task:'water'},tend:{task:'garden'},feed:{task:'visit',visitingKind:'coop'},sit:{task:'rest'},sleep:{task:'sleep'},look:{task:'idle',minutes:0},relax:{task:'idle',minutes:24},stretch:{task:'idle',minutes:72},wave:{task:'idle',minutes:144},breathe:{task:'stretch',minutes:16}};
const key=p=>JSON.stringify([p.sheet,p.row,p.frame,p.sequenceIndex]);
const weights=layers=>{const result=new Map();for(const p of layers)if(p.weight>0)result.set(key(p),(result.get(key(p))??0)+p.weight);return result;};
const same=(a,b)=>{const x=weights(a),y=weights(b);assert.deepEqual([...x.keys()].sort(),[...y.keys()].sort(),'Interruptions must retain every visible source pose');for(const [k,w]of x)assert(Math.abs(w-y.get(k))<1e-12,'Interruptions must retain displayed weights');};
let cases=0;
for(const profile of [undefined,'neutral-v1'])for(const from of Object.keys(inputs))for(const to of Object.keys(inputs)){
 if(from===to)continue;
 const step=(state,mode,dt)=>advanceResidentAnimation(state,{...person,...inputs[mode]},inputs[mode].minutes??0,dt,profile);
 let state=step(undefined,from,.31);state=step(state,to,1/60);state=step(state,to,.06);
 const target=Object.keys(inputs).find(n=>n!==from&&n!==to),interrupted=step(state,target,0);
 same(state.layers,interrupted.layers);
 assert.deepEqual(presentedPoseLayers(state.layers,'keyframes'),presentedPoseLayers(interrupted.layers,'keyframes'),'Custom keyframes must retain the displayed pose at interruption');
 assert.deepEqual(step(interrupted,target,0),interrupted,'Pause must freeze the interrupted transition');
 state=step(interrupted,target,.2);assert.equal(state.from,undefined);assert.equal(state.mode,target);assert(state.layers.every(p=>p.sheet===residentClips[target].sheet));cases++;
}
// A changing task every few milliseconds must not retain an unbounded tree of fades.
let state;const modes=Object.keys(inputs),possible=new Set();for(const c of Object.values(residentClips))for(let i=0;i<c.frames.length;i++)possible.add(key({sheet:c.sheet,row:c.row,frame:c.frames[i],sequenceIndex:i}));
for(let i=0;i<10000;i++){
 const mode=modes[i%modes.length],r={...person,...inputs[mode]};state=advanceResidentAnimation(state,r,inputs[mode].minutes??0,.003,'neutral-v1');state=advanceResidentAnimation(state,r,inputs[mode].minutes??0,.003,'neutral-v1');
 assert(state.layers.length<=possible.size+2,'Repeated interruption must remain bounded by native pose keys');assert(state.layers.every(p=>Number.isFinite(p.weight)&&p.weight>=0));assert(Math.abs(state.layers.reduce((sum,p)=>sum+p.weight,0)-1)<1e-10);
}
console.log(`PASS ${cases} interrupted profile/clip transitions, exact source weights, custom keyframe continuity, pause, completion and 10000 bounded rapid switches.`);
