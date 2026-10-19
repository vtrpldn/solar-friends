import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
import {placementReason} from '../web/polish.js';
import {sourceKinds} from '../web/resource-sites.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/restoration',{recursive:true});
const snap=g=>JSON.parse(g.snapshot());
function scene(){const g=new Game();g.start_mode('sandbox');const f=snap(g),v=f.village;Object.assign(v,{mode:'story',minutes:540,arrived:true,food:60,meals:16});Object.assign(v.progress,{compost:4,completed:Array(4).fill(true),later_completed:Array(9).fill(true)});v.economy.outside_jobs.fill(false);
 for(const r of f.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:0,social:90,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null,activity_store:null,activity_material:null,activity_building:null,walking:{},last_meal_slot:0});
 assert(g.restore(JSON.stringify(resetMaterialLocations(f))));const poor=snap(g);poor.village.land.soil=[];for(const y of [17,18])for(const x of [17,18])poor.village.land.soil.push({x,y,nutrients:.4,disturbance:.6,cover:.1});assert(g.restore(JSON.stringify(poor)));return g;}
function until(g,test,label){for(let n=0;n<12000;n++){const s=snap(g);assert(s.residents.filter(r=>r.task==='restore').length<=1,'One resident claims one restoration job');if(test(s))return s;g.tick(.25);}throw Error(label+': '+JSON.stringify(snap(g).residents.map(r=>[r.name,r.task,r.reason])));}
function checkpoint(g){const saved=g.snapshot(),h=new Game();assert(h.restore(saved));assert.equal(h.snapshot(),saved);h.free();}
const g=scene(),before=g.snapshot();assert.equal(JSON.parse(g.restoration_preview(18,18)).size,2);assert.equal(g.snapshot(),before);assert.equal(g.restore_plot(18,18),'ok');let s=snap(g),id=s.village.restoration[0].id;
assert.equal(s.village.progress.compost,4);assert.equal(s.environment.economy.materials[19].available,2);assert.equal(s.environment.economy.materials[19].reserved,2);assert.equal(s.village.restoration[0].work,0);
assert.notEqual(g.place('garden',18,18),'ok');assert.notEqual(g.toggle_road(18,18),'ok');
const reserved=g.snapshot(),previewVillage=snap(g).village,probe=new Game();let comparisons=0;
for(const kind of ['home','garden','square','streetlight','road',...sourceKinds])for(let y=16;y<=20;y++)for(let x=16;x<=20;x++){
 assert(probe.restore(reserved));const material=sourceKinds.indexOf(kind),result=material>=0?probe.place_source(material,x,y):kind==='road'?probe.toggle_road(x,y):probe.place(kind,x,y);
 assert.equal(result==='ok',!placementReason(previewVillage,kind,x,y),`${kind} at ${x}, ${y}: ${result}`);comparisons++;
}
probe.free();assert.equal(g.snapshot(),reserved);
until(g,s=>s.village.logistics.shipments.some(h=>h.carrying&&h.material===19),'Actual compost cargo');checkpoint(g);await writeFile('artifacts/restoration/carrying.json',g.snapshot());
s=until(g,s=>s.village.restoration[0].work>0&&s.village.restoration[0].finished==null,'Resident starts actual soil work');
assert.equal(s.village.progress.compost,2);assert.equal(s.village.restoration[0].spent[1]-s.village.restoration[0].spent[0],2);assert(s.village.land.soil.find(p=>p.x===18&&p.y===18).nutrients>.4);checkpoint(g);await writeFile('artifacts/restoration/working.json',g.snapshot());
const same=new Game();assert(same.restore(g.snapshot()));for(let n=0;n<80;n++){g.tick(.25);same.tick(.25);}assert.equal(same.snapshot(),g.snapshot(),'Restoration continues exactly through a working checkpoint');same.free();
s=until(g,s=>s.village.restoration[0].finished!=null,'Completed attended work');assert.equal(s.village.restoration[0].work,32);assert(!s.village.restoration[0].cancelled);assert.equal(s.village.progress.compost,2);const soil=s.village.land.soil.find(p=>p.x===18&&p.y===18);assert(Math.abs(soil.nutrients-.65)<.0001);assert(Math.abs(soil.disturbance-.25)<.0001);assert(Math.abs(soil.cover-.35)<.0001);checkpoint(g);await writeFile('artifacts/restoration/complete.json',g.snapshot());
assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));
const cancelled=scene(),initialSoil=snap(cancelled).village.land.soil;assert.equal(cancelled.restore_plot(18,18),'ok');id=snap(cancelled).village.restoration[0].id;until(cancelled,s=>s.village.logistics.shipments.some(h=>h.carrying&&h.material===19),'Cargo to cancel');assert.equal(cancelled.cancel_restoration(id),'ok');assert.notEqual(cancelled.cancel_restoration(id),'ok');until(cancelled,s=>!s.village.logistics.shipments.some(h=>h.carrying&&h.material===19),'Interrupted cargo put down safely');assert.equal(snap(cancelled).village.progress.compost,4);assert.deepEqual(snap(cancelled).village.land.soil,initialSoil,'Cancelling before attendance leaves the exact saved soil unchanged');checkpoint(cancelled);await writeFile('artifacts/restoration/cancelled.json',cancelled.snapshot());
const plantation=scene();assert.equal(plantation.place_source(0,5,5),'ok');
await writeFile('artifacts/restoration/plantation.json',plantation.snapshot());
const plantationBefore=JSON.parse(plantation.land_preview('source_timber',5,5)).ground;
assert.equal(plantation.restore_source(0),'ok');
assert.equal(snap(plantation).village.restoration[0].size,3);assert(!snap(plantation).village.economy.sources[0].restored);checkpoint(plantation);
until(plantation,s=>s.village.logistics.shipments.some(h=>h.carrying&&h.material===19),'Actual plantation compost cargo');
until(plantation,s=>s.village.restoration[0].finished!=null,'Attended plantation restoration');
const plantationAfter=JSON.parse(plantation.land_preview('source_timber',5,5)).ground;
assert(snap(plantation).village.economy.sources[0].restored);assert(plantationAfter.nutrients>plantationBefore.nutrients);assert(plantationAfter.cover>plantationBefore.cover);assert.equal(snap(plantation).village.progress.compost,2);checkpoint(plantation);
g.free();cancelled.free();plantation.free();console.log(`PASS: reserved compost, real clearing and plantation cargo and attendance, gradual soil improvement, exact working continuation, ${comparisons} placement comparisons, once-only spending and cancelled cargo recovery.`);
