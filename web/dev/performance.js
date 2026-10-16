import { paintCacheStats } from '../paint-cache.js';
// Opt-in instrumentation; no per-frame clocks or buffers in normal gameplay.
export function performanceMeter(enabled) {
  if(!enabled)return {start(){},mark(){},finish(){}};
  const rows=[],windows=[];const windowMs=300000;let period;let began,last,marks,frameStamp,lastFrameStamp,lastPaint=0;
  const box=document.createElement('pre');box.id='performance-meter';
  box.style.cssText='position:fixed;left:16px;bottom:118px;z-index:90;padding:12px;background:#162e25ee;color:#e7efce;border:1px solid #acc18b;border-radius:6px;pointer-events:none;font:12px monospace';
  document.body.append(box);
  const report=()=>{
    const summary=key=>{const values=rows.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);return {median:values[Math.floor(values.length*.5)]||0,p95:values[Math.floor(values.length*.95)]||0};};
    return {samples:rows.length,...Object.fromEntries(['simulation','sample','paint','total','frameInterval'].map(key=>[key,summary(key)]))};
  };
  const snapshot=()=>({at:new Date().toISOString(),visibility:document.visibilityState,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},cache:paintCacheStats(),heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null});
  const newPeriod=()=>({startedAt:new Date().toISOString(),activeMs:0,samples:0,bins:new Uint32Array(1002),max:0,over100:0,start:snapshot()});
  const summarize=p=>{const rank=q=>{let count=0;for(let i=0;i<p.bins.length;i++){count+=p.bins[i];if(count>=Math.ceil(p.samples*q))return i===1001?p.max:i;}return 0;};return {startedAt:p.startedAt,activeMs:p.activeMs,samples:p.samples,median:rank(.5),p95:rank(.95),max:p.max,over100:p.over100,start:p.start,end:snapshot()};};
  window.solarPerformance=Object.freeze({report,history:()=>({windowMs,completed:windows.slice(),current:period?summarize(period):null})});
  return {
    start(stamp){began=last=performance.now();frameStamp=stamp;marks={frameInterval:lastFrameStamp==null?undefined:stamp-lastFrameStamp};},
    mark(key){const now=performance.now();marks[key]=now-last;last=now;},
    finish(running){
      if(!running||document.visibilityState!=='visible'){lastFrameStamp=undefined;return;}
      lastFrameStamp=frameStamp;
      const interval=marks.frameInterval;
      if(Number.isFinite(interval)&&interval>=0){
        period??=newPeriod();period.activeMs+=interval;period.samples++;period.bins[Math.min(1001,Math.ceil(interval))]++;period.max=Math.max(period.max,interval);if(interval>100)period.over100++;
        if(period.activeMs>=windowMs){windows.push(summarize(period));if(windows.length>24)windows.shift();period=undefined;}
      }
      const now=performance.now();rows.push({...marks,total:now-began});if(rows.length>240)rows.shift();
      if(now-lastPaint<1000)return;lastPaint=now;
      const r=report();box.textContent=`FRAME COST · ${r.samples} samples\n`+['simulation','sample','paint','total'].map(k=>`${k.padEnd(11)} ${r[k].median.toFixed(2)} ms · p95 ${r[k].p95.toFixed(2)}`).join('\n')+`\nFrame gap   ${r.frameInterval.median.toFixed(2)} ms · p95 ${r.frameInterval.p95.toFixed(2)}`;
    },
  };
}
