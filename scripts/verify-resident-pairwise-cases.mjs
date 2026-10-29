import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {residentPairwiseCases} from './resident-pairwise-cases.mjs';
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const game=new Game();let catalog;try{catalog=JSON.parse(game.scenario_catalog()).resident_parts;}finally{game.free();}
const result=residentPairwiseCases(catalog);assert.deepEqual(residentPairwiseCases(catalog),result,'Coverage selection must be deterministic');
// Independently enumerate the feasible pair universe, without using the greedy
// generator's pair routine or trusting its reported counts.
const axes={outfit:catalog.bodies.flatMap(b=>catalog.body_revisions[b].filter(v=>v===catalog.body_assets[b]||v==='resident-parts-v6').map(v=>b+':'+v)),hair:catalog.hairstyles,hairColour:catalog.hair_colours,hat:catalog.hats,facialHair:catalog.facial_hair,...catalog.materials},names=Object.keys(axes);
const choices=c=>({outfit:c.recipe.body+':'+c.recipe.assetVersion,hair:c.recipe.hair,hairColour:c.recipe.hairColour??'chestnut',hat:c.recipe.hat??'none',facialHair:c.recipe.facialHair??'none',...c.recipe.materials});
function verify(cases){let pairs=0;for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)for(const a of axes[names[i]])for(const b of axes[names[j]]){
 if(names[i]==='outfit'&&names[j]==='facialHair'&&!catalog.body_facial_hair[a.split(':')[0]].includes(b))continue;
 assert(cases.some(c=>choices(c)[names[i]]===a&&choices(c)[names[j]]===b),`Missing ${names[i]}=${a} / ${names[j]}=${b}`);pairs++;
 }return pairs;}
assert.equal(verify(result.cases),result.feasiblePairs);
function verifyWithinOutfits(allCases){for(const outfit of axes.outfit){
 const cases=allCases.filter(c=>choices(c).outfit===outfit),body=outfit.split(':')[0];
 for(let i=1;i<names.length;i++)for(let j=i+1;j<names.length;j++)for(const a of axes[names[i]])for(const b of axes[names[j]]){
  if((names[i]==='facialHair'&&!catalog.body_facial_hair[body].includes(a))||(names[j]==='facialHair'&&!catalog.body_facial_hair[body].includes(b)))continue;
  assert(cases.some(c=>choices(c)[names[i]]===a&&choices(c)[names[j]]===b),`Missing pair inside ${outfit}: ${names[i]}=${a} / ${names[j]}=${b}`);
 }
}
}
verifyWithinOutfits(result.cases);
assert(result.cases.length<result.feasibleCandidates);
for(const c of result.cases){assert.deepEqual(c.values,choices(c));assert(catalog.body_facial_hair[c.recipe.body].includes(c.recipe.facialHair??'none'));assert.equal(c.values.outfit,c.recipe.body+':'+c.recipe.assetVersion);}
const oneHat=result.cases.filter(c=>c.values.hat==='none');assert.throws(()=>verify(oneHat),/Missing/,'Missing options must not masquerade as pair coverage');
const noShirtColour=result.cases.filter(c=>c.values.shirt!=='terracotta');assert.throws(()=>verify(noShirtColour),/Missing/);
const missingBroadCurlHat=result.cases.filter(c=>!(c.recipe.body==='broad-v1'&&c.values.hair==='short-curls-v1'&&c.values.hat==='straw-v1'));
assert.equal(verify(missingBroadCurlHat),result.feasiblePairs,'Global pairs alone miss body-specific attachment gaps');
assert.throws(()=>verifyWithinOutfits(missingBroadCurlHat),/Missing pair inside broad/);
console.log(`PASS ${result.cases.length} deterministic recipes cover all ${result.feasiblePairs} feasible public choice pairs from ${result.feasibleCandidates} valid combinations; all four outfits independently cover feasible pairs; missing hat/colour/body-specific attachment controls fail.`);
