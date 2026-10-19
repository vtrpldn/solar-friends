// A fresh earned village, then five independent decisions from one checkpoint.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const output=process.env.SOLAR_HOUSING_OUTPUT||'artifacts/housing-balance';
await mkdir(output,{recursive:true});
if(!process.env.SOLAR_HOUSING_REUSE){
 const run=spawnSync(process.execPath,['scripts/verify-quests.mjs',output+'/bootstrap'],{env:{...process.env,SOLAR_STORY_HOUSING_SETUP:'1'},stdio:'inherit',timeout:600000});
 assert.equal(run.status,0,'Earn the one-home village through normal Story play');
}
await import('./housing-planning-run.mjs');
