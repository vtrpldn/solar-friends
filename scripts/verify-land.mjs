import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {landTiles} from '../web/land-map.js';
import {sourceDeposit} from '../web/resource-sites.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),snap=()=>JSON.parse(g.snapshot());
assert(g.set_simulation_seed(17));
const first=g.snapshot(),report=JSON.parse(g.land_report());
assert.equal(g.land_report(),g.land_report());assert.equal(g.snapshot(),first);
assert.equal(report.deposits.length,9);assert(report.cells.length>400);
for(const [layer,material] of [['earth',2],['stone',3],['salvage',4]]){
 const cells=landTiles(report,layer);assert(cells.length>10);
 for(const cell of cells)assert(report.deposits.some(d=>d.material===material&&cell.x>=d.x&&cell.x<d.x+d.width&&cell.y>=d.y&&cell.y<d.y+d.height));
}
assert.equal(landTiles(report,'fertility').length,report.cells.length);assert.equal(landTiles(report,'retention').length,report.cells.length);
const home=JSON.parse(g.land_preview('home',6,6));assert.equal(home.cells,4);assert.equal(home.ground.fertility,Math.fround(.72));
assert.equal(g.land_preview('home',2147483647,5),'{}');assert.equal(g.place_source(3,2147483647,5),'Choose an inland clearing inside the village.');
assert.equal(g.snapshot(),first);
// Public commands and actual resident work exhaust one local reserve.
g.start_mode('sandbox');assert(g.configure_sandbox_rules(false,true,true));
// Isolate deposit exhaustion from full arrival storage. Planting stock also
// occupies real shelves; a storage house provides receiving room for the stone.
assert.equal(g.place('warehouse',6,13),'ok');
assert.equal(g.place_source(3,18,18),'ok');assert.equal(g.place_source(3,18,21),'ok');assert.equal(g.place_source(3,23,23),'ok');
for(let i=0;i<3;i++)assert.equal(g.configure_source(i,false,false),'ok');
const before=snap(),patch=before.village.economy.sources[0].deposit,other=before.village.economy.sources[2].remaining;
assert.equal(before.village.economy.sources[1].deposit,patch);assert.notEqual(before.village.economy.sources[2].deposit,patch);
assert.equal(sourceDeposit(before.village,3,18,18).id,patch);
const initial=before.village.economy.sources[0].remaining;
let previous=0;
for(let batch=0;batch<Math.ceil(initial/4);batch++){
 assert.equal(g.harvest_source(0),'ok');
 let harvested=false;
 for(let tick=0;tick<4*1920;tick++){
  g.tick(.25);
  if(tick%4===3&&snap().village.economy.sources[0].harvests>previous){harvested=true;break;}
 }
 assert(harvested,`Resident completed extraction batch ${batch+1}`);
 const s=snap();previous=s.village.economy.sources[0].harvests;
 assert.equal(s.village.economy.sources[1].remaining,s.village.economy.sources[0].remaining);
 assert.equal(s.village.economy.sources[2].remaining,other);
 const checkpoint=g.snapshot();assert(g.restore(checkpoint));assert.equal(g.snapshot(),checkpoint);
}
let s=snap();assert.equal(s.village.economy.sources[0].remaining,0);assert.equal(s.village.economy.land[1],96-initial);
assert.equal(g.clear_source(0),'ok');const exhausted=g.snapshot();
assert.match(g.place_source(3,18,18),/local deposit is exhausted/);assert.equal(g.snapshot(),exhausted);
assert.equal(g.harvest_source(2),'ok');
const intactBefore=s.village.economy.sources[2].harvests;
for(let tick=0;tick<4*1920;tick++){g.tick(.25);if(tick%4===3&&snap().village.economy.sources[2].harvests>intactBefore)break;}
s=snap();assert.equal(s.village.economy.sources[2].harvests,intactBefore+1);assert.equal(s.village.economy.sources[2].remaining,other-4);
const checkpoint=g.snapshot();assert(g.restore(checkpoint));assert.equal(g.snapshot(),checkpoint);
for(const corrupt of [state=>state.village.land.deposits[0].remaining++,state=>state.village.land.deposits[0].id=state.village.logistics.stores[0].id,state=>state.village.economy.sources[2].deposit=state.village.land.deposits[0].id]){
 const bad=JSON.parse(checkpoint);corrupt(bad);assert(!g.restore(JSON.stringify(bad)));assert.equal(g.snapshot(),checkpoint);
}
await mkdir('artifacts/land',{recursive:true});await writeFile('artifacts/land/exhausted.json',checkpoint);
// Instant Sandbox building is still real construction for its land; planning a Story blueprint is not.
const h=new Game();assert.equal(h.place('home',5,5),'ok');assert.equal(JSON.parse(h.snapshot()).village.land.soil.length,0);
h.start_mode('sandbox');assert(h.configure_sandbox_rules(false,true,true));assert.equal(h.place('home',5,5),'ok');
assert(JSON.parse(h.land_preview('road',5,5)).ground.disturbance>0);
const changed=h.snapshot();assert(h.restore(changed));assert.equal(h.snapshot(),changed);
const soil=JSON.parse(changed).village.land.soil;
assert.equal(h.queue_building_work(0,'demolish',0,0),'ok');
for(let tick=0;tick<4*1920;tick++){h.tick(.25);if(tick%4===3&&JSON.parse(h.snapshot()).village.buildings.length===0)break;}
const cleared=JSON.parse(h.snapshot());assert.equal(cleared.village.buildings.length,0,'Residents must actually complete demolition');assert.deepEqual(cleared.village.land.soil,soil);
const clearedSave=h.snapshot();assert(h.restore(clearedSave));assert.equal(h.snapshot(),clearedSave);
await writeFile('artifacts/land/disturbed.json',clearedSave);
g.free();h.free();
console.log(`PASS: seeded ground, grid-aligned overlays, footprint inspection, real resident exhaustion of ${initial} stone, isolated adjacent patches, second-patch recovery, exact saves, atomic malformed land and persistent foundations.`);
