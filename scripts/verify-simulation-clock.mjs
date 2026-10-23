import assert from 'node:assert/strict';
import {createSimulationClock,advanceSimulation} from '../web/simulation-speed.js';
let now=0,total=0,unavailable=true;
const clock=createSimulationClock({now:()=>now,budgetMs:8}),game={fast_forward_ready:()=>unavailable,tick(step){total+=step;now+=5;}};
// A slow frame consumes at most two indivisible 5 ms ticks. Repeated slow
// frames retain only a bounded catch-up window instead of amplifying a stall.
assert.equal(clock.advance(game,1,16),.2);assert.equal(now,10);assert(clock.status().pendingSeconds<=.25);assert.equal(clock.status().droppedSeconds,.75);
for(let i=0;i<100;i++){const before=now;clock.advance(game,1,16);assert.equal(now-before,10);assert(clock.status().pendingSeconds<=.25);}
assert(total>20);assert(clock.status().droppedSeconds>90);clock.reset();assert.equal(clock.status().pendingSeconds,0);assert.equal(clock.advance(game,0,16),0);
// A readiness transition mid-frame must immediately leave automatic 16×.
now=0;let calls=0;const steps=[],transition={fast_forward_ready:()=>calls===0,tick(step){steps.push(step);calls++;}};
const fast=createSimulationClock({now:()=>now});fast.advance(transition,.01,1);assert.equal(steps[0],.1);assert(Math.abs(steps[1]-.00375)<1e-12);assert.equal(fast.status().pendingSeconds,0);
// With sufficient capacity, budgeted and existing offline advancement agree.
for(const preferred of [1,2,4,8,16]){let a=0,b=0;const g=record=>({fast_forward_ready:()=>false,tick:record}),c=createSimulationClock({now:()=>0});for(let i=0;i<120;i++){c.advance(g(s=>a+=s),1/60,preferred);advanceSimulation(g(s=>b+=s),1/60,preferred);}assert.equal(a,b);assert.equal(c.status().droppedSeconds,0);}
for(const bad of [-1,NaN,Infinity])assert.throws(()=>clock.advance(game,bad,1));assert.throws(()=>clock.advance(game,1,3));assert.throws(()=>createSimulationClock({budgetMs:0}));
console.log('PASS: bounded interactive catch-up, no accumulating stalls, immediate auto-speed transitions, pause reset and identical unconstrained advancement at all supported speeds.');
