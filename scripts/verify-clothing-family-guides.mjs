// Existing frozen guides must be reproducible and never rewritten on mismatch.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const run=promisify(execFile),sha=data=>createHash('sha256').update(data).digest('hex'),root='assets/art-direction/character-prototype-v1/';let checked=0,refused=0;
for(const [name,family]of [['short-sleeve-walk-single-0-v1',null],['short-sleeve-relaxed-walk-0-v3','body-family-relaxed-v1']]){
 const intent=JSON.parse(await readFile(root+name+'/registration-intent.json','utf8')),files=[...Object.keys(intent.guideHashes),'references.json','registration-intent.json',...intent.poses.map(p=>p.key+'-grid.png')],snapshot=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(root+name+'/'+f))]))),before=await snapshot();
 assert.equal(intent.body.normalization,family?2:1);
 await run(process.execPath,['scripts/prepare-clothing-pose-guides.mjs',name,...(family?['--family='+family]:[])]);assert.deepEqual(await snapshot(),before,'Idempotent guide changed frozen files');checked++;
 for(const args of [[name,'--freeze',...(family?['--family='+family]:[])],[name,...(family?[]:['--family=body-family-relaxed-v1'])]]){let denied=false;try{await run(process.execPath,['scripts/prepare-clothing-pose-guides.mjs',...args]);}catch{denied=true;}assert(denied,'Frozen guide overwrite was accepted');assert.deepEqual(await snapshot(),before,'Failed guide changed frozen files');refused++;}
}
console.log(`PASS: ${checked} exact legacy/family guide reproductions and ${refused} frozen overwrite/wrong-body refusals; every source guide and intent byte preserved.`);
