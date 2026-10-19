import { paintCacheStats } from '../paint-cache.js';
// Opt-in instrumentation; no per-frame clocks or buffers in normal gameplay.
export function performanceMeter(enabled) {
  if(!enabled)return {start(){},mark(){},finish(){}};
  const rows=[],windows=[],slowInputs=[],costKeys=['simulation','sample','paint','total'];const windowMs=300000;let eventTimingAvailable=false;let period;let began,last,marks,frameStamp,lastFrameStamp,lastPaint=0;
  const box=document.createElement('pre');box.id='performance-meter';
  box.style.cssText='position:fixed;left:16px;bottom:118px;z-index:90;padding:12px;background:#162e25ee;color:#e7efce;border:1px solid #acc18b;border-radius:6px;pointer-events:none;font:12px monospace';
  document.body.append(box);
  const report=()=>{
    const summary=key=>{const values=rows.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);return {median:values[Math.floor(values.length*.5)]||0,p95:values[Math.floor(values.length*.95)]||0};};
    return {samples:rows.length,...Object.fromEntries(['simulation','sample','paint','total','frameInterval'].map(key=>[key,summary(key)]))};
  };
  const snapshot=()=>({at:new Date().toISOString(),visibility:document.visibilityState,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},cache:paintCacheStats(),heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null});
  const metric=()=>({samples:0,bins:new Uint32Array(1002),max:0});
  const add=(m,value,step=1)=>{if(!Number.isFinite(value)||value<0)return;m.samples++;m.bins[Math.min(1001,Math.ceil(value/step))]++;m.max=Math.max(m.max,value);};
  const quantiles=(m,step=1)=>{const rank=q=>{if(!m.samples)return 0;let count=0;for(let i=0;i<m.bins.length;i++){count+=m.bins[i];if(count>=Math.ceil(m.samples*q))return i===1001?m.max:i*step;}return 0;};return {samples:m.samples,median:rank(.5),p95:rank(.95),max:m.max};};
  const newPeriod=()=>({startedAt:new Date().toISOString(),activeMs:0,...metric(),over100:0,costs:Object.fromEntries(costKeys.map(key=>[key,metric()])),inputEvents:0,maxInputDelay:0,maxInputDuration:0,start:snapshot()});
  const summarize=p=>({startedAt:p.startedAt,activeMs:p.activeMs,...quantiles(p),over100:p.over100,costs:Object.fromEntries(costKeys.map(key=>[key,quantiles(p.costs[key],.1)])),inputEvents:p.inputEvents,maxInputDelay:p.maxInputDelay,maxInputDuration:p.maxInputDuration,start:p.start,end:snapshot()});
  // Event Timing reports only events above the browser's 16 ms threshold.
  // Absence of entries is not a measurement of all fast interactions.
  if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('event')){
    try{
      const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){
        if(document.visibilityState!=='visible')continue;
        const delay=Math.max(0,entry.processingStart-entry.startTime);
        slowInputs.push({name:entry.name,target:entry.target?.id||entry.target?.tagName||null,duration:entry.duration,inputDelay:delay});if(slowInputs.length>32)slowInputs.shift();
        if(period){period.inputEvents++;period.maxInputDelay=Math.max(period.maxInputDelay,delay);period.maxInputDuration=Math.max(period.maxInputDuration,entry.duration);}
      }});observer.observe({type:'event',buffered:true,durationThreshold:16});eventTimingAvailable=true;
    }catch{/* Unsupported browser instrumentation remains explicitly unavailable. */}
  }
  window.solarPerformance=Object.freeze({report,history:()=>({windowMs,completed:windows.slice(),current:period?summarize(period):null,eventTiming:{available:eventTimingAvailable,thresholdMs:16,recent:slowInputs.slice()}})});
  return {
    start(stamp){began=last=performance.now();frameStamp=stamp;marks={frameInterval:lastFrameStamp==null?undefined:stamp-lastFrameStamp};},
    mark(key){const now=performance.now();marks[key]=now-last;last=now;},
    finish(running){
      if(!running||document.visibilityState!=='visible'){lastFrameStamp=undefined;return;}
      lastFrameStamp=frameStamp;
      const now=performance.now(),sample={...marks,total:now-began},interval=marks.frameInterval;
      if(Number.isFinite(interval)&&interval>=0){
        period??=newPeriod();period.activeMs+=interval;add(period,interval);if(interval>100)period.over100++;
        for(const key of costKeys)add(period.costs[key],sample[key],.1);
        if(period.activeMs>=windowMs){windows.push(summarize(period));if(windows.length>24)windows.shift();period=undefined;}
      }
      rows.push(sample);if(rows.length>240)rows.shift();
      if(now-lastPaint<1000)return;lastPaint=now;
      const r=report();box.textContent=`FRAME COST · ${r.samples} samples\n`+['simulation','sample','paint','total'].map(k=>`${k.padEnd(11)} ${r[k].median.toFixed(2)} ms · p95 ${r[k].p95.toFixed(2)}`).join('\n')+`\nFrame gap   ${r.frameInterval.median.toFixed(2)} ms · p95 ${r.frameInterval.p95.toFixed(2)}`;
    },
  };
}
