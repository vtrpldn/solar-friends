// Paint terrain once per village layout. Frames reuse this texture while panning
// and zooming; the simulation's isometric coordinates stay unchanged.
export const GROUND_START = -2.5;
export const GROUND_SIZE = 32;
const RESOLUTION = 2560;

export const MAP_SIZE = 28;
export function riverCenter(y) {
  return 25.8 + Math.sin(y * 0.32) * 0.65;
}
export function riverBank(x, y) {
  return x >= riverCenter(y) - 2.3;
}

function paintRiver(g) {
  const unit = RESOLUTION / GROUND_SIZE;
  const trace = (offset = 0) => {
    g.beginPath();
    for (
      let y = GROUND_START - 1;
      y <= GROUND_START + GROUND_SIZE + 1;
      y += 0.12
    ) {
      const p = groundPoint(riverCenter(y) + offset, y);
      if (y === GROUND_START - 1) g.moveTo(...p);
      else g.lineTo(...p);
    }
  };
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  // Nested painted banks soften the transition from meadow to shallow water.
  for (const [width, color] of [
    [3.3, "#8c9a65"],
    [2.95, "#bbb584"],
    [2.65, "#c6bb8e"],
    [2.4, "#83aaa0"],
    [2.12, "#619b96"],
    [1.6, "#548e8f"],
    [0.85, "#4f878b"],
  ]) {
    trace();
    g.lineWidth = width * unit;
    g.strokeStyle = color;
    g.stroke();
  }
  for (let i = 0; i < 100; i++) {
    const y = GROUND_START + i * 0.33;
    const side = i % 2 ? 1 : -1;
    const [x, py] = groundPoint(
      riverCenter(y) + side * (1.28 + Math.sin(i * 2.1) * 0.13),
      y,
    );
    g.fillStyle = i % 3 ? "#a2a482" : "#d5cbaa";
    g.beginPath();
    g.ellipse(x, py, 5 + (i % 4) * 2, 4 + (i % 3) * 2, i, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#c1dbcd66";
    g.lineWidth = 1.5;
    const [wx, wy] = groundPoint(riverCenter(y) + Math.sin(i * 1.7) * 0.7, y);
    g.beginPath();
    g.moveTo(wx - 6, wy);
    g.quadraticCurveTo(wx, wy - 4, wx + 9, wy + 2);
    g.stroke();
  }
  g.restore();
}
function surface() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = RESOLUTION;
  return canvas;
}
function groundPoint(x, y) {
  const unit = RESOLUTION / GROUND_SIZE;
  return [(x - GROUND_START) * unit, (y - GROUND_START) * unit];
}

export function paintTerrain(texture, roads = [], resourceSites = []) {
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
  p.shadowBlur = 0;
  const unit = RESOLUTION / GROUND_SIZE;
  for (const [x, y] of roads) {
    const [px, py] = groundPoint(x, y);
    p.fillRect(px - unit / 2, py - unit / 2, unit, unit);
  }
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
  paintRiver(g);

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
  // Resource clearings sit at the property edge. Keep the same meadow texture
  // under their complete ground contact instead of dissolving it into blank space.
  for(const site of resourceSites){
    const x=(site.x-GROUND_START)/GROUND_SIZE,y=(site.y-GROUND_START)/GROUND_SIZE,r=2.3/GROUND_SIZE;
    const cover=e.createRadialGradient(x,y,r*.55,x,y,r);
    cover.addColorStop(0,'white');cover.addColorStop(1,'#ffffff00');
    e.fillStyle=cover;e.beginPath();e.arc(x,y,r,0,Math.PI*2);e.fill();
  }
  g.globalCompositeOperation = "destination-in";
  g.filter = "blur(25px)";
  g.drawImage(edge, 0, 0);
  g.filter = "none";
  g.globalCompositeOperation = "source-over";
  return ground;
}
