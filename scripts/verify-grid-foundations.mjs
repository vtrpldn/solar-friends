import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {footprint,footprintCorners,occupies,placementArt} from '../web/building-footprints.js';
import {allBuildingArt} from '../web/building-art.js';
import {project} from '../web/projection.js';
import {placementReason} from '../web/polish.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),base=JSON.parse(game.snapshot());
base.village.wood=100;base.village.progress.completed=[true,true,true,true];
base.village.progress.later_completed=[true,true,true];
assert.deepEqual(footprintCorners('home',8,8),[[6.5,6.5],[8.5,6.5],[8.5,8.5],[6.5,8.5]]);
for(const [kind,art]of Object.entries(allBuildingArt)){
  const f=footprint(kind,8,8),registration=placementArt(kind,art);
  assert(Object.values(registration).every(Number.isFinite));
  assert(registration.scale>0);
  for(const p of footprintCorners(kind,8,8))for(const coordinate of p)assert.equal(coordinate%1,.5,'Every occupied plot corner belongs to a tile boundary');
  // A road along the front face shares the exact ground segment, at any zoom.
  const rx=Math.ceil(f.minX),ry=f.maxY+.5;
  const edge=footprintCorners('road',rx,ry).slice(0,2);
  assert(edge.every(p=>p[1]===f.maxY));
  for(const zoom of [.65,1,1.75,2.5]){
    const road=edge.map(([x,y])=>project(x,y,{x:137,y:81},zoom));
    const foundation=[[rx-.5,f.maxY],[rx+.5,f.maxY]].map(([x,y])=>project(x,y,{x:137,y:81},zoom));
    assert.deepEqual(road,foundation,'Road and occupied plot must share pixels at every camera zoom');
  }
  if(kind.startsWith('home-')||kind.startsWith('adobe-')||kind==='hydro')continue;
  assert(game.restore(JSON.stringify(base)));assert.equal(game.place(kind,8,8),'ok');
  const saved=game.snapshot(),v=JSON.parse(saved).village;
  for(let x=Math.ceil(f.minX);x<f.maxX;x++)for(let y=Math.ceil(f.minY);y<f.maxY;y++){
    assert(occupies(v.buildings[0],x,y));
    assert.notEqual(game.toggle_road(x,y),'ok',`${kind}: road through occupied tile ${x},${y}`);
    assert.notEqual(placementReason(v,'road',x,y,0),'');
  }
  assert.equal(game.toggle_road(rx,ry),'ok',`${kind}: adjacent road must meet the foundation`);
  assert(game.restore(game.snapshot()));
  assert(game.restore(JSON.stringify(base)));
  assert.equal(game.toggle_road(8,8),'ok');
  assert.notEqual(game.place(kind,8,8),'ok','Buildings must not cover existing roads');
  assert.equal(JSON.parse(game.snapshot()).village.wood,100);
  assert(game.restore(JSON.stringify(base)));
  assert.equal(game.toggle_road(rx,ry),'ok');
  assert.equal(game.place(kind,8,8),'ok','A new foundation must fit directly beside an existing road');
}
// A legacy road below a building can still be loaded and removed safely.
assert(game.restore(JSON.stringify(base)));assert.equal(game.place('home',8,8),'ok');
const legacy=JSON.parse(game.snapshot());legacy.village.roads=[[7,8]];
assert(game.restore(JSON.stringify(legacy)));assert.equal(game.toggle_road(7,8),'ok');
game.free();
console.log('PASS: all 22 occupied plots on tile boundaries, road adjacency at four zooms, full-plot road exclusion, building/road conflicts and legacy saves.');
