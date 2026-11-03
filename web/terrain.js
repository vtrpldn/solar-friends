import {regionalGround} from './regional-art.js';
import {habitatAt,habitatColors} from "./habitats.js";
// Paint terrain once per village layout. Frames reuse this texture while panning
// and zooming; the simulation's isometric coordinates stay unchanged.
export const GROUND_START = -2.5;
export const GROUND_SIZE = 69;
const RESOLUTION = 4096;

export const MAP_SIZE = 64;
// Gameplay masks use the same row sample as Rust; visual curves interpolate
// between those samples so painted banks and currents remain smooth.
export function riverCenter(y,map){
  if(map?.river===null)return null;
  const rows=map?.river?.centers;
  return rows?rows[Math.max(0,Math.min(MAP_SIZE-1,Math.floor(y)))]:((MAP_SIZE-2.2)+Math.sin(y*.22)*.65);
}
export function riverCurve(y,map){
  const rows=map?.river?.centers;if(!rows)return riverCenter(y,map);
  const row=Math.max(0,Math.min(MAP_SIZE-1,y)),a=Math.floor(row),b=Math.min(MAP_SIZE-1,a+1);
  return rows[a]+(rows[b]-rows[a])*(row-a);
}
export function hydroCell(y,map){const c=riverCenter(y,map);return c===null?null:Math.ceil(c-1.35);}
export function hydroSite(x,y,map){const c=riverCenter(y,map);return c!==null&&x>=c-1.35&&x<c-.35&&[-1,1].every(d=>Math.abs(riverCenter(y+d,map)-c)<=.25);}
export function riverBank(x,y,map){const c=riverCenter(y,map);return c!==null&&(map?.river?Math.abs(x-c)<=2.3:x>=c-2.3);}

function paintRiver(g,map) {
  if(riverCenter(0,map)===null)return;
  const unit = RESOLUTION / GROUND_SIZE;
  const trace = (offset = 0) => {
    g.beginPath();
    for (
      let y = GROUND_START - 1;
      y <= GROUND_START + GROUND_SIZE + 1;
      y += 0.12
    ) {
      const p = groundPoint(riverCurve(y,map) + offset, y);
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
  for (let i = 0; i < Math.ceil(GROUND_SIZE / .33); i++) {
    const y = GROUND_START + i * 0.33;
    const side = i % 2 ? 1 : -1;
    const [x, py] = groundPoint(
      riverCurve(y,map) + side * (1.28 + Math.sin(i * 2.1) * 0.13),
      y,
    );
    g.fillStyle = i % 3 ? "#a2a482" : "#d5cbaa";
    g.beginPath();
    g.ellipse(x, py, 5 + (i % 4) * 2, 4 + (i % 3) * 2, i, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#c1dbcd66";
    g.lineWidth = 1.5;
    const [wx, wy] = groundPoint(riverCurve(y,map) + Math.sin(i * 1.7) * 0.7, y);
    g.beginPath();
    g.moveTo(wx - 6, wy);
    g.quadraticCurveTo(wx, wy - 4, wx + 9, wy + 2);
    g.stroke();
  }
  g.restore();
}
function surface(size=RESOLUTION) {
  if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(size,size);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return canvas;
}
function groundPoint(x, y) {
  const unit = RESOLUTION / GROUND_SIZE;
  return [(x - GROUND_START) * unit, (y - GROUND_START) * unit];
}

// Quantised soil colours change only when the ground has visibly changed.
// The painted meadow remains visible through every soft patch.
export function soilAppearance(soil=[]){
  return soil.map(s=>[s.x,s.y,Math.round(s.disturbance*20)/20,Math.round(s.cover*20)/20,Math.round(s.nutrients*20)/20]);
}
function paintSoil(g,soil){
  const unit=RESOLUTION/GROUND_SIZE;
  for(const [x,y,disturbance,cover,nutrients] of soil){
    const [px,py]=groundPoint(x,y),radius=unit*.85;
    const brown=Math.min(.25,disturbance*.18+Math.max(0,1-nutrients)*.08),green=Math.min(.12,Math.max(0,cover-.35)*.15+Math.max(0,nutrients-1)*.12);
    for(const [alpha,rgb] of [[brown,'125,80,40'],[green,'88,119,48']]){
      if(alpha<.005)continue;
      const patch=g.createRadialGradient(px,py,unit*.15,px,py,radius);
      patch.addColorStop(0,`rgba(${rgb},${alpha})`);patch.addColorStop(1,`rgba(${rgb},0)`);
      g.fillStyle=patch;g.beginPath();g.arc(px,py,radius,0,Math.PI*2);g.fill();
    }
  }
}
function paintedTexture(g,texture,side,row=0,rows=1,tileCells=32,makeSurface=surface){
  const tile=tileCells*RESOLUTION/GROUND_SIZE,half=texture.width/2;
  // Isolate the atlas cell before scaling. Canvas filtering can otherwise
  // sample the neighboring road or biome across a source rectangle's edges.
  const patch=makeSurface(half);patch.height=texture.height/rows;
  patch.getContext('2d').drawImage(texture,-side*half,-row*patch.height);
  try{
    for(let y=0;y<RESOLUTION;y+=tile)for(let x=0;x<RESOLUTION;x+=tile){
      const flipX=Math.round(x/tile)%2,flipY=Math.round(y/tile)%2;
      g.save();g.translate(x+(flipX?tile:0),y+(flipY?tile:0));g.scale(flipX?-1:1,flipY?-1:1);
      g.drawImage(patch,0,0,tile,tile);g.restore();
    }
  }finally{patch.width=patch.height=0;}
}
function paintHabitats(g,seed,map){
  const unit=RESOLUTION/GROUND_SIZE;
  for(let y=0;y<MAP_SIZE;y+=2)for(let x=0;x<MAP_SIZE;x+=2){
    const name=habitatAt(seed,x,y,map);if(name==='Flower meadow')continue;
    const [px,py]=groundPoint(x,y),radius=unit*2.4,patch=g.createRadialGradient(px,py,0,px,py,radius);
    patch.addColorStop(0,habitatColors[name]+'20');patch.addColorStop(1,habitatColors[name]+'00');
    g.fillStyle=patch;g.fillRect(px-radius,py-radius,radius*2,radius*2);
  }
  // Preserve small authored cells between the coarse landscape samples.
  if(map?.terrain)for(let y=0;y<MAP_SIZE;y++)for(let x=0;x<MAP_SIZE;x++){
    const name=habitatAt(seed,x,y,map),sample=habitatAt(seed,x-x%2,y-y%2,map);
    if(name===sample)continue;
    const [px,py]=groundPoint(x,y),r=unit*.8,patch=g.createRadialGradient(px,py,0,px,py,r);
    patch.addColorStop(0,habitatColors[name]+'55');patch.addColorStop(1,habitatColors[name]+'00');
    g.fillStyle=patch;g.fillRect(px-r,py-r,r*2,r*2);
  }

}
export function paintTerrain(texture, roads = [], resourceSites = [],soil=[],seed=0,map,{surface:makeSurface=surface,regional=regionalGround(map)}={}) {
  const ground = makeSurface(RESOLUTION);
  const g = ground.getContext("2d");
  if(regional?.image)texture=regional.image;
  const row=regional?.image?regional.row:0,rows=regional?.image?2:1;
  paintedTexture(g,texture,0,row,rows,regional?.image?8:32,makeSurface);
  // Regional atlases have much finer grass/stone detail than the original
  // painted ground. Let their local earth colours recede behind placed objects.
  g.fillStyle=regional?.image?(row===0?'rgba(171,164,100,0.50)':'rgba(194,168,117,0.50)'):'rgba(167,178,105,0.24)';
  g.fillRect(0,0,RESOLUTION,RESOLUTION);
  paintHabitats(g,seed,map);
  paintSoil(g,soil);
  // An empty road clip contributes no pixels. Paint directly into the ground
  // so road cells need no additional 4096-square transparent surface.
  if(roads.length){
    g.save();
    // Clip once to the union of road cells. Repeated source-in tile draws
    // erase previous tiles and can leave the entire road layer transparent.
    g.beginPath();
    const unit = RESOLUTION / GROUND_SIZE;
    for (const [x, y] of roads) {
      const [px, py] = groundPoint(x, y);
      g.rect(px - unit / 2, py - unit / 2, unit, unit);
    }
    g.clip();
    paintedTexture(g,texture,1,row,rows,regional?.image?8:32,makeSurface);
    g.restore();
  }
  paintRiver(g,map);

  // Irregular meadow edges dissolve into the map surround instead of forming
  // a hard, board-game diamond. The complete buildable area stays opaque.
  const edge = makeSurface(RESOLUTION);
  const e = edge.getContext("2d");
  e.scale(RESOLUTION, RESOLUTION);
  e.fillStyle = "white";
  e.beginPath();
  // Dissolve only the margin outside the complete property.
  const inset=.018;
  e.roundRect(inset,inset,1-2*inset,1-2*inset,.025);
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
