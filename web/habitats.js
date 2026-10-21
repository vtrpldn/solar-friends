import {riverCenter} from './terrain.js';
// Keep these broad habitat boundaries aligned with src/land/habitat.rs.
export const habitatColors={'Cerrado savanna':'#a7a264','Caatinga woodland':'#bba578','River meadow':'#829c68','Rocky woodland':'#aaa585','Clay terraces':'#b49765','Atlantic forest':'#5f824a','Dry woodland':'#a3a362','Flower meadow':'#87965b'};
export const habitatNames=Object.fromEntries(Object.keys(habitatColors).map(name=>[name.toLowerCase().replaceAll(' ','-'),name]));
export function habitatAt(seed,x,y,map){
  if(x>=0&&x<64&&y>=0&&y<64){const key=map?.terrain?.[Math.floor(y)*64+Math.floor(x)]?.habitat;if(habitatNames[key])return habitatNames[key];}
  const phase=(seed%997)/997*Math.PI*2,wave=Math.sin(y*.13+phase)*2;
  if(riverCenter(y,map)!==null&&Math.abs(x-riverCenter(y,map))<4.5)return 'River meadow';
  if(x>21+wave*.6&&y>=8&&y<20)return 'Rocky woodland';
  if(y>23+Math.sin(x*.18+phase)*1.8&&x>14)return 'Clay terraces';
  if(y>23+wave*.5&&x<14)return 'Atlantic forest';
  if(x>18+wave*.5&&y<8)return 'Dry woodland';
  return 'Flower meadow';
}
