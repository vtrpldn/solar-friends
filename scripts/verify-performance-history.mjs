import assert from 'node:assert/strict';
import {performanceMeter} from '../web/dev/performance.js';
const original={document:globalThis.document,window:globalThis.window,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight,devicePixelRatio:globalThis.devicePixelRatio};
try{
 globalThis.document={visibilityState:'visible',createElement:()=>({style:{}}),body:{append(){}}};globalThis.window={};globalThis.innerWidth=1600;globalThis.innerHeight=900;globalThis.devicePixelRatio=1;
 const meter=performanceMeter(true);
 const frame=(stamp,running=true)=>{meter.start(stamp);meter.mark('simulation');meter.mark('sample');meter.mark('paint');meter.finish(running);};
 // A five-minute session with a known distribution and an isolated long stall.
 frame(0);for(let i=1;i<=18000;i++)frame(i*1000/60);
 let history=window.solarPerformance.history();assert.equal(history.completed.length,1);assert.equal(history.completed[0].p95,17);assert.equal(history.completed[0].over100,0);assert.equal(history.completed[0].samples,18000);
 document.visibilityState='hidden';frame(400000);document.visibilityState='visible';frame(500000);frame(500200);
 history=window.solarPerformance.history();assert.equal(history.current.samples,1);assert.equal(history.current.max,200);assert.equal(history.current.over100,1);assert.equal(history.current.activeMs,200,'Hidden time must not enter active windows');
 assert.equal(history.current.end.cache.budget,48*1024*1024);assert.equal(window.solarPerformance.report().samples,240,'Existing rolling report remains bounded');
 // Long unattended sessions retain a bounded history, rather than every frame.
 for(let i=1;i<=26;i++){frame(500200+i*300000);}
 assert.equal(window.solarPerformance.history().completed.length,24);
 console.log('PASS: five-minute percentiles, stalls, visibility exclusions, cache snapshots and bounded history.');
}finally{for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
