import assert from 'node:assert/strict';
import {strokeCells,clearingStroke} from '../web/editor/brush.js';
for(let x=0;x<64;x++)for(let y=0;y<64;y++){
 const cells=strokeCells([31,31],[x,y]);
 assert.deepEqual(cells[0],[31,31]);assert.deepEqual(cells.at(-1),[x,y]);
 assert.ok(cells.length<=64);
 for(let i=1;i<cells.length;i++)assert.equal(Math.max(...cells[i].map((n,j)=>Math.abs(n-cells[i-1][j]))),1);
}
assert.deepEqual(strokeCells([NaN,0],[1,1]),[]);
assert.equal(strokeCells([-1e12,0],[1e12,0]).length,64);
assert.deepEqual(clearingStroke([{x:32,y:32,size:9,disturbance:.05}],[[32,32]],3),[{x:32,y:32,size:9,disturbance:.05}]);
assert.deepEqual(clearingStroke([],[[0,0],[63,63],[30,30]],3),[{x:30,y:30,size:3,disturbance:.05}]);
const original=[];clearingStroke(original,[[30,30]],3);assert.deepEqual(original,[]);
assert.throws(()=>clearingStroke(Array.from({length:64},()=>({x:1,y:1,size:1,disturbance:0})),[[30,30]],3),/64 clearing/);
console.log('PASS all 4096 stroke destinations, bounded outside-map samples, brush coverage, edge clipping and atomic limit rejection.');
