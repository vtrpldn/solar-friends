import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {footfallSquare,recordFootfall,wearLevel} from '../web/v02/weekend/footfall.js';
import {GAME_DAY} from '../web/v02/weekend/biological-production.js';

// One crossing must not make a path, a well-used route must, and an abandoned one must grow back.
{
  const s={time:0,people:[{x:10,z:10}]};
  const cross=()=>{s.people[0].x=10;for(let n=0;n<40;n++){const before=[[s.people[0].x,10]];s.people[0].x+=.25;recordFootfall(s,before,1);}};
  cross();
  const square=footfallSquare(15,10);
  assert.equal(s.footfall.squares[square],2,'a crossing leaves two half-metre strides in each one-metre square');
  assert(wearLevel(s.footfall.squares[square])<.01,'one crossing leaves no visible mark');
  for(let n=1;n<20;n++)cross();
  assert(wearLevel(s.footfall.squares[square])<.07,'twenty crossings only begin to yellow the grass');
  for(let n=20;n<150;n++)cross();
  assert(wearLevel(s.footfall.squares[square])>.3,'a hundred and fifty crossings pack the earth');
  // A ride or relocation is not a walk.
  const before=[[s.people[0].x,10]];s.people[0].x=60;s.people[0].z=60;recordFootfall(s,before,1);
  assert.equal(s.footfall.squares[footfallSquare(60,60)],undefined,'a jump leaves no footprints');
  const packed=s.footfall.squares[square];
  s.time=GAME_DAY*30;recordFootfall(s,[[60,60]],1);
  assert(s.footfall.squares[square]<packed*.35,'thirty unused days let most of the grass return');
  s.time=GAME_DAY*400;recordFootfall(s,[[60,60]],1);
  assert.deepEqual(s.footfall.squares,{},'an abandoned path disappears');
}
// Residents going about their day leave footfall, including through a save and during fast time.
{
  const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);
  for(let n=0;n<GAME_DAY*2;n++)tick(s,1);
  const strides=Object.values(s.footfall.squares);
  assert(strides.length>50,'two days of camp life tread the ground');
  assert(strides.every(Number.isInteger),'footfall is stored as whole strides');
  const restored=restore(save(s));
  assert.deepEqual(restored.footfall,s.footfall,'footfall survives a save');
  const bad=JSON.parse(save(s));bad.footfall.squares={'-4':1.5};
  const repaired=restore(JSON.stringify(bad));
  assert(repaired&&repaired.footfall===undefined,'a damaged footfall record is dropped, not the village');
  const size=JSON.stringify(s.footfall).length;
  assert(size<60000,`footfall stays small in the save (${size} bytes after two days)`);
}
console.log('PASS footfall accumulates by distance, regrows, survives saves and is recorded during fast time');
// Walkers keep to a track others have worn rather than cutting a new line beside it.
{
  const {route}=await import('../web/v02/weekend/simulation.js');
  const {trodden}=await import('../web/v02/weekend/footfall.js');
  const s=createWeekend(42);chooseCamp(s,'entrance');
  // A track one cell to the side is worth the small detour over a long enough walk.
  const lines=[];
  for(const length of [16,20,24,28])for(const dz of [6,9,12,-6,-9])for(const dx of [-2,2+length]){
    const from={x:s.stock.x+dx-length,z:s.stock.z+dz},to={x:s.stock.x+dx,z:s.stock.z+dz};
    const direct=route(s,from,to);
    if(direct&&direct.every(p=>Math.abs(p.z-from.z)<.01))lines.push([from,to]);
  }
  assert(lines.length,'open ground is crossed in a straight line');
  const [from,to]=lines.at(-1);
  s.footfall={day:0,squares:{}};
  for(let x=from.x-.5;x<=to.x+.5;x+=.5)for(const z of [from.z+1,from.z+1.25])s.footfall.squares[footfallSquare(x,z)]=300;
  assert(trodden(s,from.x+4,from.z+1)&&!trodden(s,from.x+4,from.z-1),'a well-used track is recognised');
  const drawn=route(s,from,to);
  assert(drawn.some(p=>Math.abs(p.z-(from.z+1))<.01),'the route bends onto the worn track');
}
console.log('PASS worn tracks attract walkers');
