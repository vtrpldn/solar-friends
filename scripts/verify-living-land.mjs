import {startEmptySandbox} from './lib/empty-sandbox.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {resetMaterialLocations} from '../web/dev/material-fixture.js';
import {soilAppearance} from '../web/terrain.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
await mkdir('artifacts/living-land',{recursive:true});
const snap=g=>JSON.parse(g.snapshot());
function checkpoint(g){const s=g.snapshot(),h=new Game();assert(h.restore(s));assert.equal(h.snapshot(),s);assert(!s.includes('natural_light'));h.free();}
function until(g,test,label,limit=4*1920){for(let n=0;n<limit;n++){if(test(snap(g)))return;g.tick(.25);}throw Error(label);}
const edge=new Game();let tree=null;
for(let seed=0;seed<64&&!tree;seed++){assert(edge.set_simulation_seed(seed));tree=snap(edge).village.land.vegetation.find(t=>{const x=Math.floor(t.x+.5),y=Math.floor(t.y+.5);return t.species<4&&x>=1&&x<=22&&y>=1&&y<=26;});}
assert(tree);const point=[Math.floor(tree.x+.5),Math.floor(tree.y+.5)],standing=edge.snapshot(),before=JSON.parse(edge.land_report());
await writeFile('artifacts/living-land/standing-trees.json',standing);
assert.equal(edge.toggle_road(...point),'ok');assert.equal(edge.toggle_road(...point),'ok');const after=JSON.parse(edge.land_report());
assert(snap(edge).village.land.vegetation.find(t=>t.index===tree.index).cleared);assert(after.cells.some((cell,i)=>cell.ground.shade<before.cells[i].ground.shade),'Clearing a visible trunk changes actual shade');
const soil=snap(edge).village.land.soil;checkpoint(edge);assert.deepEqual(snap(edge).village.land.soil,soil);await writeFile('artifacts/living-land/cleared-tree.json',edge.snapshot());
const g=new Game();let f=snap(g);Object.assign(f.village,{minutes:540,arrived:true,food:80,meals:16});f.village.progress.compost=6;
for(const r of f.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,energy:90,hunger:0,social:90,last_meal_slot:0,x:10+(r.id-2)*1.25,y:13,target_x:10+(r.id-2)*1.25,target_y:13,activity_batch:null,activity_store:null,activity_material:null,activity_building:null,walking:{}});
assert(g.restore(JSON.stringify(resetMaterialLocations(f))));await writeFile('artifacts/living-land/ground-before.json',g.snapshot());
for(let pass=0;pass<4;pass++)for(let y=15;y<=17;y++)for(let x=14;x<=18;x++){assert.equal(g.toggle_road(x,y),'ok');assert.equal(g.toggle_road(x,y),'ok');}
const marked=snap(g),appearance=soilAppearance(marked.village.land.soil),markedSave=g.snapshot();assert.equal(appearance.length,15);assert(marked.village.land.soil.every(s=>Math.abs(s.disturbance-.72)<.0001));
assert.equal(g.snapshot(),markedSave,'Terrain presentation never mutates soil');checkpoint(g);await writeFile('artifacts/living-land/disturbed-clearing.json',g.snapshot());
for(const [x,y]of [[15,16],[17,16],[19,16]])assert.equal(g.restore_plot(x,y),'ok');until(g,s=>s.village.restoration.every(j=>j.finished!=null),'Residents finish restoring the actual road clearing');
assert.equal(snap(g).village.progress.compost,0);assert(snap(g).village.land.soil.some(s=>s.nutrients>1&&s.disturbance<.4));checkpoint(g);await writeFile('artifacts/living-land/restored-clearing.json',g.snapshot());
const quarry=new Game();assert.equal(quarry.place_source(3,18,18),'ok');assert.equal(snap(quarry).village.land.soil.length,0);assert.equal(quarry.harvest_source(0),'ok');
until(quarry,s=>s.village.economy.sources[0].harvests>0,'Actual resident extraction');const worked=snap(quarry).village.land.soil;assert(worked.length===4&&worked.every(s=>s.disturbance>0));assert.equal(quarry.clear_source(0),'ok');assert.deepEqual(snap(quarry).village.land.soil,worked);checkpoint(quarry);await writeFile('artifacts/living-land/extracted-ground.json',quarry.snapshot());
const banana=new Game();startEmptySandbox(banana);assert(banana.configure_sandbox_rules(false,true,true));assert.equal(banana.place('solar_farm',18,18),'ok');let noon=snap(banana);noon.village.minutes=720;assert(banana.restore(JSON.stringify(noon)));
const sun=snap(banana).environment.power.solar_generation;assert.equal(banana.place('banana_treatment',15,16),'ok');const shaded=snap(banana).environment.power.solar_generation;
assert(shaded<sun);banana.configure_banana_treatment(false);assert.equal(snap(banana).environment.power.solar_generation,shaded);checkpoint(banana);await writeFile('artifacts/living-land/banana-shade.json',banana.snapshot());
for(const game of [edge,g,quarry,banana])game.free();console.log(`PASS: seeded visible forest and real clearing shade, saved road/extraction disturbance, ${appearance.length} restrained soil patches, resident restoration, exact checkpoints, read-only appearance, and banana canopy solar exposure (${sun.toFixed(2)} → ${shaded.toFixed(2)}).`);
