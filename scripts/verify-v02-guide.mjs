import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {guideSnapshot,verifyGuide,GUIDE_DIR} from './guide-content.mjs';
import {guideFacts} from '../web/v02/weekend/guide-facts.js';
assert.equal(await verifyGuide(),28);
assert.deepEqual(guideFacts('crops',{crops:{test:{name:'Test crop',days:99}}}),['Test crop: 99 favorable growth days']);
assert.deepEqual(guideFacts('compost',{recipes:{compost:{input:{scraps:7},output:{compost:3}}}}),['Composting: 7 kg residues → 3 kg mature compost']);
assert.deepEqual(guideFacts('food',{crops:{test:{name:'Test crop'}},foodDays:{test:8}}),['Test crop: 8 days before ordinary spoilage']);
const base=await mkdtemp(path.join(tmpdir(),'solar-guide-check-'));
try{
 const dir=path.join(base,GUIDE_DIR);await mkdir(dir,{recursive:true});await mkdir(path.join(base,'scripts'));
 const write=(file,text)=>writeFile(path.join(base,file),text);
 await write('web/v02/weekend/core.js','export const growth=1;');await write('web/v02/weekend/guide-facts.js','export const fact=1;');await write('scripts/verify-v02-core.mjs','');await write('scripts/build-guide.mjs','renderer');await write('package-lock.json','{}');
 const topic={id:'core',title:'Core',description:'Current behavior',diagram:'flowchart LR\n A-->B',tip:'Keep reserves',sources:['core.js'],tests:['core']};
 await write(GUIDE_DIR+'/topics.json',JSON.stringify([topic]));await write(GUIDE_DIR+'/core.svg','<svg></svg>');
 const baseline=()=>guideSnapshot(base).then(s=>write(GUIDE_DIR+'/reviewed.json',JSON.stringify(s)));
 await baseline();assert.equal(await verifyGuide(base),1);
 await write('web/v02/weekend/core.js','export const growth=2;');await assert.rejects(verifyGuide(base),/sources:.*core.js/);await baseline();
 await write('web/v02/weekend/new-system.js','export const value=1;');await assert.rejects(verifyGuide(base),/new-system.js/);await baseline();
 await write(GUIDE_DIR+'/topics.json',JSON.stringify([{...topic,tip:'Changed explanation'}]));await assert.rejects(verifyGuide(base),/content: topics/);await baseline();
 await write(GUIDE_DIR+'/core.svg','<svg><text>Changed output</text></svg>');await assert.rejects(verifyGuide(base),/assets: core.svg/);await baseline();
 await write('web/v02/weekend/guide-facts.js','export const fact=2;');await assert.rejects(verifyGuide(base),/content: facts/);
 const topics=JSON.parse(await readFile(GUIDE_DIR+'/topics.json','utf8'));assert(topics.every(t=>t.tip&&t.sources.length&&t.tests.length));
}finally{await rm(base,{recursive:true,force:true});}
console.log('PASS Guide source/content/asset freshness gates, new-system detection and definition-driven facts');
