// The same 06:00–18:00 solar day used by the power simulation.
export function sunlightAt(time, cloud = 0) {
  const hour = (((9 + (time * 0.45) / 60) % 24) + 24) % 24;
  const angle = ((hour - 6) * Math.PI) / 12;
  const height = hour > 6 && hour < 18 ? Math.sin(angle) : 0;
  const daylight = Math.min(1, height * 5);
  cloud = Math.max(0, Math.min(1, cloud));
  return {
    hour,
    // Fixed world-space orbit: east at dawn, west at dusk. Never follows the camera.
    x: Math.cos(angle) * 85,
    y: Math.max(4, height * 75),
    z: 28,
    daylight,
    warmth: (1 - Math.min(1, height * 2)) * (1 - cloud),
    direct: daylight * (2.1 + height * 1.3) * (1 - cloud * 0.88),
    ambient: 0.65 + daylight * (1.35 + cloud * 0.25),
    shadow: daylight * (1 - cloud * 0.85),
  };
}
