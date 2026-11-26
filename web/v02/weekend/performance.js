import {query} from './url-flags.js';
// Opt-in, visible diagnostics. Frame timing includes browser scheduling and GPU stalls.
export function performanceReadout(renderer) {
  if (!query.has("performance")) return () => {};
  const output = document.createElement("output");
  output.style.cssText =
    "position:fixed;bottom:65px;right:18px;background:#183b2eea;color:#fff;padding:10px;border-radius:6px;font:12px monospace;z-index:20";
  output.id = "performance";
  output.setAttribute("aria-label", "Rendering performance");
  document.body.append(output);
  let previous = performance.now(),
    last = previous;
  const frames = [];
  const motionFrames = [];
  const renderedFrames = [];
  let previousMotionTime;
  return (now, motionTime, rendered = true) => {
    const elapsed = now - previous;
    previous = now;
    if (elapsed > 0 && !document.hidden) {
      frames.push(elapsed);
      renderedFrames.push(Number(rendered));
      motionFrames.push(
        previousMotionTime !== undefined &&
          Math.abs(motionTime - previousMotionTime) > 1e-7
          ? 1
          : 0,
      );
      if (frames.length > 300) {
        frames.shift();
        renderedFrames.shift();
        motionFrames.shift();
      }
    }
    previousMotionTime = motionTime;
    if (now - last < 1000) return;
    last = now;
    if (!frames.length) return;
    const sorted = [...frames].sort((a, b) => a - b);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    output.textContent = `${Math.round(1000 / mean)} callbacks/s · ${Math.round(renderedFrames.reduce((a,b)=>a+b,0)*1000/frames.reduce((a,b)=>a+b,0))} renders/s · ${Math.round((motionFrames.reduce((a, b) => a + b, 0) * 1000) / frames.reduce((a, b) => a + b, 0))} motion updates/s · p95 ${Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0)} ms · ${renderer.info.render.calls} draw calls in last render · ${renderer.info.render.triangles.toLocaleString()} triangles`;
  };
}
