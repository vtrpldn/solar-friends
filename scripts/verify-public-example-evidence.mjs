import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root=process.argv[2]??'assets/scenario-reviews/modular-examples-v1';
for(const id of ['first-clearing','before-the-dry-season','an-inherited-village']){
 const raw=await readFile(`web/examples/${id}.solar-scenario`,'utf8'),definition=JSON.parse(raw),report=JSON.parse(await readFile(`${root}/${id}/${id}-public-controls.json`,'utf8'));
 assert.equal(report.sourceSha256,createHash('sha256').update(raw).digest('hex'),`${id}: evidence must bind to the retained source`);assert.equal(report.schema,1);assert(Number.isFinite(report.finishedAt));assert.equal(report.controls.preferredSpeed,8);assert(report.observations.length>0);assert.equal(report.observations.at(-1).finished,report.finishedAt);
 for(const key of ['saveReloadExact','editorUnchanged','scratchRunRemoved'])assert.equal(report[key],true,`${id}: ${key}`);
 assert(report.observations.every((o,i)=>i===0||o.minute>=report.observations[i-1].minute));if(definition.journal.challenge)assert(report.finishedAt<=definition.journal.challenge.deadline);
 for(const suffix of ['completion','journal'])assert((await readFile(`${root}/${id}/${id}-public-${suffix}.png`)).length>10000);
}
console.log('PASS: all three public-control completion records match retained scenario sources, ordinary speed controls, deadline eligibility, exact reload, unchanged editor return, scratch cleanup and captured completion/journal screens.');
