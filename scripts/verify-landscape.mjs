import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {MAP_SIZE,riverBank,hydroCell} from '../web/terrain.js';
import {habitatAt} from '../web/habitats.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const output='artifacts/landscape';await mkdir(output,{recursive:true});
const snap=g=>JSON.parse(g.snapshot());
function checkpoint(g){const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);copy.free();}
function readyState(g,minute){const s=snap(g);s.village.minutes=minute;s.village.arrived=true;Object.keys(s.village.economy.outside_jobs).forEach(id=>s.village.economy.outside_jobs[id]=false);for(const r of s.residents)Object.assign(r,{task:'idle',remaining:0,requested:false,energy:90,hunger:5,social:90,last_meal_slot:-1,x:7.5+r.id*1.25,y:15,target_x:7.5+r.id*1.25,target_y:15});return s;}
const report={map:MAP_SIZE,modes:[],habitats:[],species:[],work:[],shelter:[],checks:[]};
assert.equal(MAP_SIZE,64);
for(const mode of ['story','sandbox']){
 const g=new Game();assert(g.start_mode(mode));const s=snap(g),v=s.village;
 assert.equal(v.map_size,64);assert.equal(v.land.water.length,4096);assert.deepEqual(v.buildings.map(b=>b.kind),['shed','warehouse']);assert(v.buildings.every(b=>b.progress===100));
 const store=v.logistics.stores.find(p=>p.owner.kind==='warehouse');assert(store.items[16]>0);assert(store.items.reduce((a,b)=>a+b,0)<=store.capacity);
 const land=JSON.parse(g.land_report());assert(land.cells.length>800);assert.equal(land.cells.filter(c=>c.x>=28||c.y>=28).length>80,true);
 for(const c of land.cells)assert.equal(c.ground.biome,habitatAt(v.land.seed,c.x,c.y));
 report.habitats=[...new Set(land.cells.map(c=>c.ground.biome))];report.species=[...new Set(v.land.vegetation.map(t=>t.species))].sort((a,b)=>a-b);assert.equal(report.habitats.length,6);assert.equal(report.species.length,12);
 if(mode==='sandbox'){
   assert.equal(g.place('home',22,28),'ok');assert.equal(g.place('garden',26,28),'ok');assert.equal(g.toggle_road(24,28),'ok');assert.equal(g.place('hydro',hydroCell(5),5),'ok');assert.notEqual(g.place('home',MAP_SIZE-2,28),'ok');
   // Clear an actual trunk, rather than assuming a fixed meadow cell contains one.
   let cleared=false;
   for(const tree of snap(g).village.land.vegetation){
     if(g.toggle_road(Math.floor(tree.x+.5),Math.floor(tree.y+.5))!=='ok')continue;
     if(snap(g).village.land.vegetation.some(t=>t.cleared)){cleared=true;break;}
   }
   assert(cleared,'Road construction clears a tree actually standing on its cell');
 }
 checkpoint(g);report.modes.push({mode,startingFood:v.food,indoorFood:store.items[16],plants:v.land.vegetation.length});g.free();
}
for(const minute of [450,800,1100]){
 const g=new Game();g.start_mode('story');const s=readyState(g,1440+minute);assert(g.restore(JSON.stringify(s)));assert.equal(g.place('garden',13,14),'ok');assert.match(g.request(1,'build',false),/Happy/);
 let progress=0;for(let frame=0;frame<110;frame++){g.tick(.25);progress=snap(g).village.buildings.find(b=>b.kind==='garden').progress;if(progress>0)break;}
 const after=snap(g);assert(progress>0,`Resident-attended construction at ${minute}`);const m=after.village.minutes%1440;assert(m<540||m>=720&&m<900||m>=960,'Progress occurs outside the removed work windows');
 checkpoint(g);report.work.push({started:minute,workedAt:m,progress});g.free();
}
for(const minute of [720,900]){
 const g=new Game();g.start_mode('story');const s=readyState(g,minute);for(const r of s.residents)r.energy=10;assert(g.restore(JSON.stringify(s)));
 for(let frame=0;frame<100;frame++)g.tick(.25);
 const after=snap(g),shed=after.village.buildings.find(b=>b.kind==='shed');
 assert(after.residents.every(r=>r.task==='rest'&&Math.hypot(r.x-r.target_x,r.y-r.target_y)<.09&&Math.abs(r.x-shed.x)<1.2&&Math.abs(r.y-shed.y)<1.2),'All five actually reach the roofed resting area');
 for(const a of after.residents)for(const b of after.residents)if(a.id<b.id)assert(Math.hypot(a.x-b.x,a.y-b.y)>=1.09,'Keep breathing space under the roof');
 assert(after.residents.every(r=>r.energy>10));checkpoint(g);await writeFile(`${output}/${minute===900?'rain':'shade'}-shelter.json`,g.snapshot());report.shelter.push({weather:minute===900?'rain':'sun',residents:5,energy:after.residents.map(r=>r.energy)});g.free();
}
const g=new Game();g.start_mode('story');let arrived=false;const started=performance.now();
for(let frame=0;frame<1920;frame++){g.tick(.25);if(frame%80===0){checkpoint(g);const s=snap(g);arrived ||= s.village.arrived;assert(s.residents.every(r=>Number.isFinite(r.energy)&&r.energy>=0&&r.energy<=100));assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));}}
assert(arrived,'The group must finish its arrival without being blocked by early chores');report.dayReplaySeconds=(performance.now()-started)/1000;report.checks=['64-cell native/frontend boundaries','six matching habitat regions','twelve plant/outcrop species','far-property construction and river power','owned starter supplies and exact saves','resident-attended work outside former windows','rain and sun shelter with personal space','one day of needs, material conservation and checkpoints'];g.free();
await writeFile(`${output}/results.json`,JSON.stringify(report,null,2)+'\n');console.log('PASS: '+report.checks.join('; ')+'.');console.log(JSON.stringify(report.work));
