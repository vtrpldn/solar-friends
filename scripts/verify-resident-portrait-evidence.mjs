import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';
import {residentPairwiseCases} from './resident-pairwise-cases.mjs';
const root=process.argv[2]??'assets/art-direction/character-prototype-v1/public-pairwise-portraits-v1',read=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex'),report=await read(root+'/report.json'),verdict=await read(root+'/verdict.json');
assert.equal(report.completed,true);for(const [p,h]of Object.entries(report.inputs))assert.equal(sha(await readFile(p)),h,`Stale portrait rendering input: ${p}`);
for(const [p,h]of Object.entries(verdict.inputs))assert.equal(sha(await readFile(p)),h,`Stale portrait verification input: ${p}`);
for(const [p,h]of Object.entries(verdict.evidence))assert.equal(sha(await readFile(root+'/'+p)),h,`Changed portrait evidence: ${p}`);
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const game=new Game();let appearances;try{const catalog=JSON.parse(game.scenario_catalog()),coverage=residentPairwiseCases(catalog.resident_parts);assert.deepEqual(report.coverage,coverage);appearances=[...coverage.cases.map(c=>c.recipe),...catalog.resident_appearances.map(p=>({preset:p.key,version:p.version}))];}finally{game.free();}
assert.deepEqual(report.appearances,appearances);assert.equal(report.cases.length,appearances.length);
for(const [index,c]of report.cases.entries()){
 assert.equal(c.index,index);assert.equal(c.samePreparedFrame,true);assert.equal(c.checks.length,4);assert.deepEqual(c.checks.map(s=>`${s.night}:${s.height}`).sort(),['0:72','0:76','1:72','1:76']);for(const s of c.checks)assert(Number.isSafeInteger(s.opaquePixels)&&s.opaquePixels>0&&s.opaquePixels<=64*s.height);
}
const expected=Array.from({length:Math.ceil(appearances.length/21)},(_,i)=>`portraits-${i+1}.png`);assert.deepEqual((await readdir(root)).filter(p=>p.endsWith('.png')).sort(),expected);assert.deepEqual([...verdict.reviewedBoards].sort(),expected);assert.deepEqual(verdict.pendingVisualReview,[]);
console.log(`PASS ${appearances.length} current portrait/world identities, ${appearances.length*4} size/lighting records and ${expected.length} hash-bound reviewed boards; record integrity is separate from visual judgment.`);
