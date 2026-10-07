// Paint terrain once per village layout. Frames reuse this texture while panning
// and zooming; the simulation's isometric coordinates stay unchanged.
export const GROUND_START = -2.5;
export const GROUND_SIZE = 24;
const RESOLUTION = 2048;

function surface() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = RESOLUTION;
  return canvas;
}
function groundPoint(x, y) {
  const unit = RESOLUTION / GROUND_SIZE;
  return [(x - GROUND_START) * unit, (y - GROUND_START) * unit];
}

export function paintTerrain(texture, buildings) {
  const ground = surface();
  const g = ground.getContext("2d");
  const half = texture.width / 2;
  g.drawImage(
    texture,
    0,
    0,
    half,
    texture.height,
    0,
    0,
    RESOLUTION,
    RESOLUTION,
  );

  const paths = surface();
  const p = paths.getContext("2d");
  p.lineCap = "round";
  p.lineJoin = "round";
  p.strokeStyle = p.fillStyle = "white";
  p.shadowColor = "white";
  p.shadowBlur = 12;
  const hub = groundPoint(10, 13);
  p.beginPath();
  p.ellipse(hub[0], hub[1], 102, 80, -0.3, 0, Math.PI * 2);
  p.fill();
  // Worn paths connect the same entrances residents walk towards. Slightly
  // curved edges keep the square placement grid out of the visual language.
  for (const building of buildings) {
    const end = groundPoint(building.x + 0.75, building.y + 0.75);
    const bend = Math.sin(building.id * 2.4) * 42;
    p.lineWidth =
      building.kind === "garden" || building.kind === "grove" ? 48 : 65;
    p.beginPath();
    p.moveTo(...hub);
    p.bezierCurveTo(
      hub[0] + (end[0] - hub[0]) * 0.4 + bend,
      hub[1] + (end[1] - hub[1]) * 0.35,
      end[0] - bend * 0.3,
      end[1],
      ...end,
    );
    p.stroke();
    p.beginPath();
    p.ellipse(end[0], end[1], 45, 35, 0, 0, Math.PI * 2);
    p.fill();
  }
  const entry = groundPoint(10, 19.5);
  p.lineWidth = 54;
  p.beginPath();
  p.moveTo(...hub);
  p.bezierCurveTo(
    hub[0] - 30,
    hub[1] + 180,
    entry[0] + 35,
    entry[1] - 140,
    ...entry,
  );
  p.stroke();
  p.shadowBlur = 0;
  p.globalCompositeOperation = "source-in";
  p.drawImage(
    texture,
    half,
    0,
    half,
    texture.height,
    0,
    0,
    RESOLUTION,
    RESOLUTION,
  );
  g.drawImage(paths, 0, 0);

  // Irregular meadow edges dissolve into the map surround instead of forming
  // a hard, board-game diamond. The complete buildable area stays opaque.
  const edge = surface();
  const e = edge.getContext("2d");
  e.scale(RESOLUTION, RESOLUTION);
  e.fillStyle = "white";
  e.beginPath();
  e.moveTo(0.08, 0.15);
  e.bezierCurveTo(0.03, 0.04, 0.28, 0.075, 0.4, 0.055);
  e.bezierCurveTo(0.6, 0.02, 0.8, 0.065, 0.9, 0.08);
  e.bezierCurveTo(0.99, 0.23, 0.92, 0.4, 0.955, 0.6);
  e.bezierCurveTo(0.975, 0.75, 0.94, 0.88, 0.88, 0.925);
  e.bezierCurveTo(0.69, 0.965, 0.51, 0.925, 0.34, 0.95);
  e.bezierCurveTo(0.13, 0.94, 0.035, 0.86, 0.065, 0.71);
  e.bezierCurveTo(0.045, 0.51, 0.025, 0.34, 0.08, 0.15);
  e.fill();
  g.globalCompositeOperation = "destination-in";
  g.filter = "blur(25px)";
  g.drawImage(edge, 0, 0);
  g.filter = "none";
  g.globalCompositeOperation = "source-over";
  return ground;
}
