import {MAP_SIZE} from '../terrain.js';
// Author fixtures in their compact local coordinates, then place the village
// around the shared camp. Geological deposits and the river remain on the land.
export function centerLayout(state){
  const v=state.village,dx=MAP_SIZE/2-10,dy=MAP_SIZE/2-13;
  const move=p=>{p.x+=dx;p.y+=dy;};
  v.camp=[MAP_SIZE/2,MAP_SIZE/2];
  for(const b of v.buildings)if(b.kind!=='hydro')move(b);
  v.roads=v.roads.map(([x,y])=>[x+dx,y+dy]);
  for(const s of v.economy.sources)if(s.material<2)move(s);
  for(const r of state.residents){move(r);r.target_x+=dx;r.target_y+=dy;r.walking={};}
  return state;
}
