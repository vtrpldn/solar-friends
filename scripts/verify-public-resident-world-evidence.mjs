import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Evidence integrity, not an automated judgment of visual quality.
const root=process.argv[2]??'assets/art-direction/character-prototype-v1/public-worlds-v1';
const sha=b=>createHash('sha256').update(b).digest('hex');
const reportBytes=await readFile(`${root}/report.json`),report=JSON.parse(reportBytes);
const verdict=JSON.parse(await readFile(`${root}/verdict.json`));
assert.equal(report.completed,true);
assert.equal(verdict.reportSha256,sha(reportBytes));
for(const [path,hash]of Object.entries(report.inputs))assert.equal(sha(await readFile(path)),hash,`Stale rendering input: ${path}`);
const biomes=['mata-atlantica','cerrado','caatinga'],zooms=[.75,1.5,2],states=['day','night','rain','night-rain'];
const expected=biomes.flatMap(b=>zooms.flatMap(z=>states.map(s=>`${b}-${z}-${s}.png`))).sort();
assert.equal(report.views.length,36);
assert.deepEqual(report.views.map(v=>v.file).sort(),expected);
assert.deepEqual((await readdir(root)).filter(p=>p.endsWith('.png')).sort(),expected);
assert.deepEqual(verdict.reviewedViews.map(v=>v.file).sort(),expected);
assert.deepEqual(verdict.pendingVisualReview,[]);
for(const view of report.views){
 assert.equal(view.file,`${view.biome}-${view.zoom}-${view.state}.png`);
 const bytes=await readFile(`${root}/${view.file}`);
 assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(bytes.readUInt32BE(16),1600);assert.equal(bytes.readUInt32BE(20),1100);
 assert.equal(sha(bytes),view.sha256,`Changed capture: ${view.file}`);
 const review=verdict.reviewedViews.find(r=>r.file===view.file);
 assert.equal(review.sha256,view.sha256);assert(review.finding.length>40);
 assert.equal(view.people.length,12);
 assert.deepEqual(view.people.map(p=>p.index),Array.from({length:12},(_,i)=>i+1));
 for(const p of view.people){assert.equal(p.width,48*view.zoom);assert.equal(p.facing,view.state.includes('night')?-1:1);}
 if(view.state.includes('rain'))assert(view.airWeather.streaks>0);
}
assert.deepEqual(report.properties.map(p=>p.biome).sort(),[...biomes].sort());
for(const property of report.properties)assert.equal(sha(await readFile(`${root}/${property.file}`)),property.sha256);
assert.equal(report.appearances.recipes.length,8);assert.equal(report.appearances.classic.length,5);
console.log('PASS 36 current hash-bound world views, three scenario fixtures and individual inspection records; static representative scope only.');
