export const CHICKEN_WIDTH = 26;
let chickenArt;
let chickenReady;
export function loadChickenArt(source) {
  if (!chickenReady) {
    chickenArt = new Image();
    chickenArt.src = source || new URL('./art/chickens.png', import.meta.url).href;
    chickenReady = chickenArt.decode();
  }
  return chickenReady;
}

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
        variant: i,
        facing: Math.cos(phase) < 0 ? -1 : 1,
        peck: Math.max(0, Math.sin(phase * 5)) * 3,
        color: ["#fff3d6", "#c58b51", "#62513f"][i],
      };
    }));
}

// Two painted poses per hen, cropped from a three-column/two-row atlas.
// Per-row foot baselines prevent a peck from moving the bird off the ground.
export function chickenFrame(hen) {
  const row = hen.peck > 1.5 ? 1 : 0;
  const column = hen.variant ?? 0;
  return { column, row, anchor: (row ? [406, 404, 406][column] : 478) / 512 };
}
export function drawChicken(ctx, p, scale, hen) {
  if (!chickenArt?.complete || !chickenArt.naturalWidth) return;
  const { column, row, anchor } = chickenFrame(hen);
  const cellW = chickenArt.naturalWidth / 3;
  const cellH = chickenArt.naturalHeight / 2;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(scale * hen.facing, scale);
  ctx.fillStyle = '#443b291c';
  ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(chickenArt, column * cellW, row * cellH, cellW, cellH,
    -CHICKEN_WIDTH / 2, -CHICKEN_WIDTH * anchor, CHICKEN_WIDTH, CHICKEN_WIDTH);
  ctx.restore();
}
