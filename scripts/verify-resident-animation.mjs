import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import init, { Game } from '../web/pkg/solar_friends.js';
import { residentClips, residentActivity, sampleResidentClip, advanceResidentAnimation } from '../web/resident-animation.js';
const resident = {id:0,x:10,y:10,target_x:10,target_y:10,task:'idle'};
assert.deepEqual(new Set(Array.from({length:8},(_,i) => residentActivity(resident,i*24))), new Set(['look','stretch','wave','relax']));
for (const task of ['idle','socialize','gathering']) {
  for (let minutes=0;minutes<1440;minutes+=7) assert.notEqual(residentActivity({...resident,task},minutes),'sit');
}
for (const task of ['rest','eat']) assert.equal(residentActivity({...resident,task},0),'sit');
assert.equal(residentActivity({...resident,task:'sleep'},0),'sleep');
assert.equal(residentActivity({...resident,target_x:12,task:'rest'},0),'walk');
for (const mode of Object.keys(residentClips)) {
  for (let step=0;step<800;step++) {
    const layers=sampleResidentClip(mode,step/60);
    assert(Math.abs(layers.reduce((sum,p)=>sum+p.weight,0)-1)<1e-10);
    assert(layers.every(p=>p.frame>=0 && p.frame<4 && p.row>=0 && p.row<4 && p.weight>=0));
  }
}
// Walk keyframes overlap for a short eased interval, and meet at the cycle seam.
assert.equal(sampleResidentClip('walk',.1).length,2);
assert.equal(sampleResidentClip('walk',.5)[0].frame,0);
for (const mode of ['stretch','wave','relax']) assert(sampleResidentClip(mode,30).every(p=>p.frame===0));
let animation=advanceResidentAnimation(undefined,{...resident,target_x:9},0,.1);
animation=advanceResidentAnimation(animation,{...resident,x:9.9,target_x:9},0,.1);
assert.equal(animation.facing,-1);
const stopped={...resident,x:9.9,target_x:9.9};
animation=advanceResidentAnimation(animation,stopped,0,.016);
assert.equal(animation.facing,-1,'Arriving must not flip the resident');
animation=advanceResidentAnimation(animation,stopped,0,.09);
assert(animation.layers.some(p=>p.sheet==='base') && animation.layers.some(p=>p.sheet==='idle'));
assert(Math.abs(animation.layers.reduce((sum,p)=>sum+p.weight,0)-1)<1e-10);
const paused=advanceResidentAnimation(animation,stopped,0,0);
assert.deepEqual(paused,animation,'Pause must freeze pose, facing, breathing, and transition');
animation=advanceResidentAnimation(animation,stopped,0,.1);
assert(animation.layers.every(p=>p.sheet==='idle'));
await init({module_or_path:await fs.readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game();
assert(game.restore(await fs.readFile(new URL('../web/artwork/resident-preview.json',import.meta.url),'utf8')));
const preview=JSON.parse(game.snapshot());
assert(preview.residents.every(r=>r.task==='idle' && r.x===r.target_x && r.y===r.target_y));
assert(new Set(preview.residents.map(r=>residentActivity(r,preview.village.minutes))).size>=3);
for (const name of ['iara','bento','luz','caua','nina']) {
  const png=await fs.readFile(new URL(`../web/art/animations/${name}-idle.png`,import.meta.url));
  assert.equal(png.readUInt32BE(16),png.readUInt32BE(20),'Idle atlas must have square cells');
  assert.equal(png[25],6,'Idle atlas must have an alpha channel');
}
console.log('PASS: four standing idles, seated task boundaries, eased frames and transitions, stable facing, pause, and resident preview');
