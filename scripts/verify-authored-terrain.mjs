import {sampleFrame} from '../web/frame-state.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {habitatAt} from '../web/habitats.js';
import {terrainRevision} from '../web/terrain-revision.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game();
try{
 const d=JSON.parse(g.scenario_template('sandbox'));d.rules.land=true;
 assert.equal(JSON.parse(g.load_scenario(JSON.stringify(d))).ok,true);
 const old=g.land_report(),baseline=g.snapshot();
 d.map.terrain=JSON.parse(g.terrain_template());assert.equal(d.map.terrain.length,4096);assert.equal(g.snapshot(),baseline);
 assert.equal(JSON.parse(g.load_scenario(JSON.stringify(d))).ok,true);assert.equal(g.land_report(),old);
 const before=JSON.parse(g.land_preview('road',12,12)),stock=JSON.parse(g.snapshot()).village.economy.stock;
 d.map.terrain[12*64+12]={habitat:'rocky-woodland',fertility:.44,retention:.7,cover:.36};
 assert.equal(JSON.parse(g.load_scenario(JSON.stringify(d))).ok,true);
 const after=JSON.parse(g.land_preview('road',12,12));assert.equal(after.ground.biome,'Rocky woodland');assert.equal(after.ground.retention,Math.fround(.7));assert(after.growth_multiplier<before.growth_multiplier);
 for(const cell of JSON.parse(g.land_report()).cells)assert.equal(cell.ground.biome,habitatAt(d.map.seed,cell.x,cell.y,d.map));
 assert.deepEqual(JSON.parse(g.snapshot()).village.economy.stock,stock);
 const raw=g.snapshot();assert(copy.restore(raw));assert.equal(copy.snapshot(),raw);
 const r=terrainRevision(d.map);assert.equal(terrainRevision(d.map),r);assert.equal(terrainRevision(structuredClone(d.map)),r);
 const bad=structuredClone(d);bad.map.terrain[0].habitat='unsupported';assert.notEqual(terrainRevision(bad.map),r);assert.equal(JSON.parse(g.load_scenario(JSON.stringify(bad))).ok,false);assert.equal(g.snapshot(),raw);
 bad.map.terrain.pop();assert.equal(JSON.parse(g.load_scenario(JSON.stringify(bad))).ok,false);assert.equal(g.snapshot(),raw);
 const report=g.report_state();assert(report.length*2<g.snapshot().length);assert(!g.restore(report));
 let view=JSON.parse(g.snapshot()),origin=view.village.scenario;
 for(let n=0;n<4;n++){g.tick(.25);view=sampleFrame(g,view,true);assert.equal(view.village.scenario,origin);assert.deepEqual(view.village.scenario,JSON.parse(g.snapshot()).village.scenario);}
 console.log('PASS read-only baseline freezing, exact native land preservation, real habitat/soil growth changes, all-cell frontend agreement, stable terrain revisions, unchanged stock and atomic malformed-grid rejection.');
}finally{g.free();copy.free();}
