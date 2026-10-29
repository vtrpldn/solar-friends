import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=process.argv[2]??'assets/scenario-reviews/public-continuation-v1';
const results=[];
for(const id of ['first-clearing','before-the-dry-season','an-inherited-village']){
 const raw=await readFile(`web/examples/${id}.solar-scenario`),definition=JSON.parse(raw),r=JSON.parse(await readFile(`${root}/${id}/${id}-public-controls.json`));
 assert.equal(r.sourceSha256,createHash('sha256').update(raw).digest('hex'),`${id}: retained example changed`);assert.equal(r.schema,1);assert.equal(r.postDays,3);assert.equal(r.controls.preferredSpeed,8);assert(Number.isFinite(r.finishedAt));if(definition.journal.challenge)assert(r.finishedAt<=definition.journal.challenge.deadline);
 for(const flag of ['saveReloadExact','editorUnchanged','scratchRunRemoved'])assert.equal(r[flag],true,`${id}: ${flag}`);
 assert(r.observations.length&&r.continuation.length,`${id}: missing actual gameplay observations`);const lastCompletion=r.observations.at(-1);assert.equal(lastCompletion.finished,r.finishedAt);let minute=lastCompletion.minute;
 for(const s of r.continuation){assert(s.minutes>minute,`${id}: stalled or reversed continuation`);minute=s.minutes;assert.equal(s.energy.length,definition.start.residents.length);assert.equal(s.hunger.length,s.energy.length);assert.equal(s.tasks.length,s.energy.length);assert([s.food,s.meals,s.money,...s.energy,...s.hunger].every(Number.isFinite));assert(s.food>=0&&s.meals>=0);assert([...s.energy,...s.hunger].every(n=>n>=0&&n<=100),`${id}: needs outside their valid bounds`);}
 assert(minute-lastCompletion.minute>=3*1440,`${id}: fewer than three days after observed completion`);
 for(const type of ['completion','journal'])assert((await readFile(`${root}/${id}/${id}-public-${type}.png`)).length>10000);
 results.push({id,finished:r.finishedAt,lastMinute:minute,continuedMinutes:minute-lastCompletion.minute,minEnergy:Math.min(...r.continuation.flatMap(s=>s.energy)),maxHunger:Math.max(...r.continuation.flatMap(s=>s.hunger)),minFood:Math.min(...r.continuation.map(s=>s.food+s.meals))});
}
console.log(JSON.stringify({passed:true,results,scope:'Current example sources, public completion plus three later days, finite bounded needs, exact reload and editor isolation records. No claim of passive long-term self-sufficiency, unfamiliar-player usability or full release acceptance.'},null,2));
