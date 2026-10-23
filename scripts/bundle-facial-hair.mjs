// Copy unmodified selected paint and its pose registrations into the bundled
// runtime catalog. File names are fixed here, never supplied by player recipes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='assets/art-direction/character-prototype-v1',manifestPath=root+'/short-beard-complete-jaw-corrected-v1/report.json',manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes),destination='web/art/characters/prototype-v1',body=JSON.parse(await readFile(destination+'/straw-hat-work-v1-registration.json','utf8')).source.body;
const sources=[],poses=[],seen=new Set();
for(const [i,source]of manifest.sources.entries()){
 const bytes=await readFile(root+'/'+source.collection+'/'+source.paint),hash=createHash('sha256').update(bytes).digest('hex');assert.equal(hash,source.sha256);
 const file=`facial-short-chestnut-source-${String(i+1).padStart(2,'0')}-v1.png`,raw=JSON.parse(await readFile(root+'/'+source.collection+'/'+source.file,'utf8')),registrations=(Array.isArray(raw)?raw:[raw]).filter(r=>source.selectedPoses.includes(r.sheet+':'+r.index));assert.equal(registrations.length,source.selectedPoses.length);
 sources.push({file,sha256:hash});for(const registration of registrations){const key=registration.sheet+':'+registration.index;assert(!seen.has(key));seen.add(key);assert.equal(registration.source.sha256,hash);assert.equal(registration.bodyFrameSha256,body.frames[registration.sheet][registration.index]);poses.push({file,registration});}
 await writeFile(destination+'/'+file,bytes,{flag:'wx'}).catch(async error=>{if(error.code!=='EEXIST')throw error;assert.equal(createHash('sha256').update(await readFile(destination+'/'+file)).digest('hex'),hash,'Use a new bundled revision instead of replacing reviewed paint');});
}
assert.equal(seen.size,48);assert(['base','idle','activities'].every(sheet=>Array.from({length:16},(_,i)=>seen.has(sheet+':'+i)).every(Boolean)));
const owner={schema:1,part:'short-chestnut-v1',assetVersion:'resident-parts-v1',body,sources,poses,reviewSource:{manifest:manifestPath,sha256:createHash('sha256').update(manifestBytes).digest('hex')}};
await writeFile(destination+'/facial-short-chestnut-v1-registration.json',JSON.stringify(owner,null,2)+'\n');console.log('Bundled '+sources.length+' immutable sources and '+poses.length+' facial poses.');
