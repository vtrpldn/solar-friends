// Opt-in instrumentation; no per-frame clocks or buffers in normal gameplay.
export function performanceMeter(enabled) {
  if(!enabled)return {start(){},mark(){},finish(){}};
  const rows=[];let began,last,marks,lastPaint=0;
  const box=document.createElement('pre');box.id='performance-meter';
  box.style.cssText='position:fixed;left:16px;bottom:118px;z-index:90;padding:12px;background:#162e25ee;color:#e7efce;border:1px solid #acc18b;border-radius:6px;pointer-events:none;font:12px monospace';
  document.body.append(box);
  const report=()=>{
    const summary=key=>{const values=rows.map(r=>r[key]).sort((a,b)=>a-b);return {median:values[Math.floor(values.length*.5)]||0,p95:values[Math.floor(values.length*.95)]||0};};
    return {samples:rows.length,...Object.fromEntries(['simulation','sample','paint','total'].map(key=>[key,summary(key)]))};
  };
  window.solarPerformance=Object.freeze({report});
  return {
    start(){began=last=performance.now();marks={};},
    mark(key){const now=performance.now();marks[key]=now-last;last=now;},
    finish(running){
      if(!running)return;
      const now=performance.now();rows.push({...marks,total:now-began});if(rows.length>240)rows.shift();
      if(now-lastPaint<1000)return;lastPaint=now;
      const r=report();box.textContent=`FRAME COST · ${r.samples} samples\n`+['simulation','sample','paint','total'].map(k=>`${k.padEnd(11)} ${r[k].median.toFixed(2)} ms · p95 ${r[k].p95.toFixed(2)}`).join('\n');
    },
  };
}
