// Opt-in, visible diagnostics. Frame timing includes browser scheduling and GPU stalls.
export function performanceReadout(renderer) {
  if (!new URLSearchParams(location.search).has("performance")) return () => {};
  const output = document.createElement("output");
  output.style.cssText =
    "position:fixed;bottom:65px;right:18px;background:#183b2eea;color:#fff;padding:10px;border-radius:6px;font:12px monospace;z-index:20";
  output.id = "performance";
  output.setAttribute("aria-label", "Rendering performance");
  document.body.append(output);
  let previous = performance.now(),
    last = previous;
  const frames = [];
  return (now) => {
    const elapsed = now - previous;
    previous = now;
    if (elapsed < 250 && !document.hidden) {
      frames.push(elapsed);
      if (frames.length > 300) frames.shift();
    }
    if (now - last < 1000) return;
    last = now;
    const sorted = [...frames].sort((a, b) => a - b);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    output.textContent = `${Math.round(1000 / mean)} fps · p95 ${Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0)} ms · ${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles.toLocaleString()} triangles`;
  };
}
