// Derive the flock from completed coops and village time, so pause, speed,
// and save/reload share the simulation clock without separate animal saves.
export function flock(village) {
  const hour = village.minutes % 1440;
  if (hour < 360 || hour >= 1110) return [];
  const daylight = Math.min(1, (hour - 360) / 30, (1110 - hour) / 30);
  return village.buildings.filter(b => b.kind === "coop" && b.progress >= 100)
    .flatMap(b => Array.from({ length: 3 }, (_, i) => {
      const phase = village.minutes * 0.045 + b.id * 2.7 + i * 2.1;
      return {
        x: b.x + Math.sin(phase) * 0.8 * daylight,
        y: b.y + (0.7 + Math.cos(phase * 0.8 + i) * 0.22) * daylight,
        facing: Math.cos(phase) < 0 ? -1 : 1,
        peck: Math.max(0, Math.sin(phase * 5)) * 3,
        color: ["#fff3d6", "#c58b51", "#62513f"][i],
      };
    }));
}

export function drawChicken(ctx, p, scale, hen) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(scale * hen.facing, scale);
  ctx.fillStyle = "#443b2926";
  ctx.beginPath(); ctx.ellipse(0, 1, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#bd8038"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(-3, 0);
  ctx.moveTo(2, -4); ctx.lineTo(3, 0); ctx.stroke();
  ctx.fillStyle = hen.color;
  ctx.beginPath(); ctx.ellipse(0, -8, 7, 5, -.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(-10, -15); ctx.lineTo(-8, -5); ctx.fill();
  ctx.beginPath(); ctx.ellipse(6, -12 + hen.peck, 3.6, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#be5241";
  ctx.beginPath(); ctx.ellipse(6, -16 + hen.peck, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#deb052";
  ctx.beginPath(); ctx.moveTo(9, -13 + hen.peck); ctx.lineTo(13, -11 + hen.peck); ctx.lineTo(9, -10 + hen.peck); ctx.fill();
  ctx.fillStyle = "#292b23";
  ctx.beginPath(); ctx.arc(7, -13 + hen.peck, .8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
