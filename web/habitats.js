import {riverCenter} from './terrain.js';
// Keep these broad habitat boundaries aligned with src/land/habitat.rs.
export const habitatColors={'River meadow':'#829c68','Rocky woodland':'#aaa585','Clay terraces':'#b49765','Atlantic forest':'#5f824a','Dry woodland':'#a3a362','Flower meadow':'#87965b'};
export function habitatAt(seed,x,y){
  const phase=(seed%997)/997*Math.PI*2,wave=Math.sin(y*.13+phase)*2;
  if(x>riverCenter(y)-4.5)return 'River meadow';
  if(x>21+wave*.6&&y>=8&&y<20)return 'Rocky woodland';
  if(y>23+Math.sin(x*.18+phase)*1.8&&x>14)return 'Clay terraces';
  if(y>23+wave*.5&&x<14)return 'Atlantic forest';
  if(x>18+wave*.5&&y<8)return 'Dry woodland';
  return 'Flower meadow';
}
