import {riverCenter} from './terrain.js';
// Keep these broad habitat boundaries aligned with src/land/habitat.rs.
export const habitatColors={'River meadow':'#829c68','Rocky woodland':'#aaa585','Clay terraces':'#b49765','Atlantic forest':'#5f824a','Dry woodland':'#a3a362','Flower meadow':'#87965b'};
export function habitatAt(seed,x,y){
  const phase=(seed%997)/997*Math.PI*2,wave=Math.sin(y*.13+phase)*2;
  if(x>riverCenter(y)-6)return 'River meadow';
  if(x>33+wave&&y<34)return 'Rocky woodland';
  if(y>40+Math.sin(x*.12+phase)*3&&x>22)return 'Clay terraces';
  if(y>31+wave&&x<27)return 'Atlantic forest';
  if(x>21+wave&&y<18)return 'Dry woodland';
  return 'Flower meadow';
}
