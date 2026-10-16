import {hydroCell} from '../web/terrain.js';
import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/utility-routes',{recursive:true});
const g=new Game();startEmptySandbox(g);
for(const [kind,x,y]of [['well',5,5],['garden',12,5],['kitchen',16,5],['wetland',5,18],['eco_toilet',12,18],['banana_treatment',17,18],['biodigester',20,12],['solar_farm',6,9],['streetlight',18,9],['hydro',hydroCell(5),5]])assert.equal(g.place(kind,x,y),'ok',kind);
assert.equal(g.place_source(0,5,24),'ok');assert.equal(g.place_source(1,12,24),'ok');
const original=g.snapshot(),reports=[];
// An independent distance calculation checks optimality from the published
// corridor map, rather than trusting the native path's chosen predecessor tree.
function minimumCells(layout,from,to){
  const cells=new Set(layout.corridors.map(p=>p.join(','))),distance=new Map(),queue=[];
  for(const port of layout.endpoints.find(e=>e.id===from).ports){const key=port.cell.join(',');if(!distance.has(key)){distance.set(key,1);queue.push(port.cell);}}
  const targets=new Set(layout.endpoints.find(e=>e.id===to).ports.map(p=>p.cell.join(',')));
  for(let i=0;i<queue.length;i++){
    const [x,y]=queue[i],n=distance.get([x,y].join(','));if(targets.has([x,y].join(',')))return n;
    for(const next of [[x+1,y],[x,y+1],[x-1,y],[x,y-1]]){const key=next.join(',');if(cells.has(key)&&!distance.has(key)){distance.set(key,n+1);queue.push(next);}}
  }
  return Infinity;
}
for(const [kind,from,to]of [['fresh',-1,2],['fresh',0,1],['irrigation',3,1],['greywater',2,3],['sewage',4,5],['sewage',4,6],['electricity',7,8],['electricity',9,8],['irrigation',3,-2],['fresh',0,-3]]){
  const nodes=JSON.parse(g.snapshot()).village.power.network.nodes,node=building=>nodes.find(n=>n.owner.kind==='building'&&n.owner.id===building).id;
  const a=kind==='electricity'?node(from):from,b=kind==='electricity'?node(to):to;
  const layout=JSON.parse(g.utility_endpoints(kind)),result=JSON.parse(g.utility_preview(kind,a,b));assert(result.allowed,JSON.stringify(result));
  const p=result.plan;assert.equal(p.kind,kind);assert.equal(p.from,a);assert.equal(p.to,b);assert.equal(result.preview_only,true);
  assert.equal(p.cells.length,minimumCells(layout,a,b),'Route uses the fewest legal corridor cells');
  const available=new Set(layout.corridors.map(p=>p.join(',')));assert(p.cells.every(c=>available.has(c.join(','))));
  assert.deepEqual(p.cells[0],p.start.cell);assert.deepEqual(p.cells.at(-1),p.end.cell);
  assert(p.cells.every((c,i)=>!i||Math.abs(c[0]-p.cells[i-1][0])+Math.abs(c[1]-p.cells[i-1][1])===1));
  assert.deepEqual(JSON.parse(g.utility_preview(kind,a,b)),result);reports.push(result);
}
for(const [kind,from,to]of [['fresh',3,2],['irrigation',3,2],['greywater',2,1],['sewage',4,1],['fresh',0,0],['electricity',7,999999],['fresh',-2147483648,1],['bad',0,1]])assert.equal(JSON.parse(g.utility_preview(kind,from,to)).allowed,false);
assert.equal(g.snapshot(),original,'Queries never allocate IDs, spend resources, or install service');
const reload=new Game();assert(reload.restore(original));assert.equal(reload.snapshot(),original);assert.equal(reload.utility_preview('fresh',0,1),g.utility_preview('fresh',0,1));reload.free();
const p=JSON.parse(g.utility_preview('fresh',0,1)).plan;for(const c of p.cells)assert.equal(g.toggle_road(...c),'ok');
assert.equal(JSON.parse(g.utility_preview('fresh',0,1)).plan.road_cells,p.cells.length);
await writeFile('artifacts/utility-routes/ready.json',g.snapshot());await writeFile('artifacts/utility-routes/routes.json',JSON.stringify(reports,null,2));
assert.equal(g.queue_building_work(0,'move',5,14),'ok');assert.match(JSON.parse(g.utility_preview('fresh',0,1)).reason,/Finish building work/);
await writeFile('artifacts/utility-routes/moving.json',g.snapshot());assert.equal(g.cancel_building_work(0),'ok');assert.equal(JSON.parse(g.utility_preview('fresh',0,1)).allowed,true);
// Blueprint ports remain inspectable but cannot promise a usable connection.
const story=new Game();assert.equal(story.place('well',5,5),'ok');assert.equal(story.place('garden',12,5),'ok');assert.match(JSON.parse(story.utility_preview('fresh',0,1)).reason,/Finish building work/);
await writeFile('artifacts/utility-routes/blueprints.json',story.snapshot());
const adjacent=new Game();startEmptySandbox(adjacent);assert.equal(adjacent.place('well',5,5),'ok');assert.equal(adjacent.place('eco_toilet',7,5),'ok');
const short=JSON.parse(adjacent.utility_preview('fresh',0,1));assert(short.allowed);assert.deepEqual(short.plan.cells,[[6,5]]);assert.notDeepEqual(short.plan.start.edge,short.plan.end.edge);
const noSupply=new Game();startEmptySandbox(noSupply);assert.equal(noSupply.place('garden',5,5),'ok');assert.equal(JSON.parse(noSupply.utility_endpoints('irrigation')).endpoints.filter(e=>e.supply).length,0);
await writeFile('artifacts/utility-routes/no-supply.json',noSupply.snapshot());
for(const game of [g,story,adjacent,noSupply])game.free();
console.log('PASS: ten native routes across five separate utility classes, renewable plots, exact footprint ports, river-generator bank lead, road corridors, incompatible classes, blueprints, moving, exact saves and read-only queries. Previews install no service.');
