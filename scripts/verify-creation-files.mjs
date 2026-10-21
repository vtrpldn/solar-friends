import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {creationFile,freezeCreation,MAX_CREATION_BYTES} from '../web/editor/files.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game();
try{
 const d=JSON.parse(g.scenario_template('sandbox'));assert.equal(JSON.parse(g.load_scenario(JSON.stringify(d))).ok,true);
 const input=structuredClone(d),baseline=g.land_report();
 const frozen=freezeCreation(d,{terrain:JSON.parse(g.terrain_template()),snapshot:JSON.parse(g.report_state()),catalog:JSON.parse(g.scenario_catalog())});
 assert.deepEqual(d,input);assert.equal(frozen.map.terrain.length,4096);assert.deepEqual(frozen.map.nature,d.map.nature);assert.deepEqual(frozen.map.deposits,d.map.deposits);
 const raw=creationFile(frozen);assert(Buffer.byteLength(raw)<=MAX_CREATION_BYTES);assert.equal(JSON.parse(copy.load_scenario(raw)).ok,true);assert.equal(copy.land_report(),baseline);
 const draft=structuredClone(d);draft.map.nature=Array.from({length:19000},(_,i)=>({id:`plant-${i}`,species:'jucara',x:1,y:1,size:1}));
 assert(Buffer.byteLength(JSON.stringify(draft))<MAX_CREATION_BYTES);assert(Buffer.byteLength(JSON.stringify(draft,null,2))>MAX_CREATION_BYTES);
 const compact=creationFile(draft);assert(Buffer.byteLength(compact)<=MAX_CREATION_BYTES);assert.deepEqual(JSON.parse(compact),draft);
 const report=JSON.parse(copy.validate_scenario(compact));assert(!report.issues.some(i=>['file_too_large','invalid_json','invalid_definition'].includes(i.code)));assert(report.issues.some(i=>i.code==='invalid_nature'));
 assert.throws(()=>creationFile({...d,description:'🌱'.repeat(MAX_CREATION_BYTES)}),/sharing size/);
 console.log('PASS frozen map export/import preserves native land, authored data is untouched, oversized formatting falls back to compact JSON, logical drafts remain editable and byte limits include Unicode.');
}finally{g.free();copy.free();}
