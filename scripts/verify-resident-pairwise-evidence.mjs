import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';
import {residentPairwiseCases} from './resident-pairwise-cases.mjs';
const root=process.argv[2]??'assets/art-direction/character-prototype-v1/public-pairwise-poses-v1',read=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex'),report=await read(root+'/report.json'),verdict=await read(root+'/verdict.json');
assert.equal(report.completed,true);for(const [p,h]of Object.entries(report.inputs))assert.equal(sha(await readFile(p)),h,`Stale rendering input: ${p}`);
for(const [p,h]of Object.entries(verdict.inputs))assert.equal(sha(await readFile(p)),h,`Stale verification input: ${p}`);
for(const [p,h]of Object.entries(verdict.evidence))assert.equal(sha(await readFile(root+'/'+p)),h,`Changed retained evidence: ${p}`);
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const game=new Game();try{assert.deepEqual(report.coverage,residentPairwiseCases(JSON.parse(game.scenario_catalog()).resident_parts),'Retained matrix must cover the current selectable catalog');}finally{game.free();}
assert.equal(report.cases.length,report.coverage.cases.length);const expected=[];for(let batch=1;batch<=Math.ceil(report.cases.length/7);batch++)for(const sheet of ['base','idle','activities','feeding-return'])expected.push(`batch-${batch}-${sheet}.png`);
assert.deepEqual((await readdir(root)).filter(p=>p.endsWith('.png')).sort(),expected.sort(),'Every complete or partial batch needs all four boards');
assert.deepEqual([...verdict.reviewedBoards].sort(),expected,'Visual-review records must name each retained board exactly once');assert.deepEqual(verdict.pendingVisualReview,[]);
for(const [i,c]of report.cases.entries()){assert.equal(c.index,i);assert.equal(c.checked,52);assert.equal(c.body,report.coverage.cases[i].recipe.body);assert.equal(c.assetVersion,report.coverage.cases[i].recipe.assetVersion);}
console.log(`PASS current catalog/source identity, ${report.cases.length} recipe records, ${report.cases.length*52} drawings and ${expected.length} hash-bound static-board review records. This verifies record integrity, not an independent visual verdict.`);
