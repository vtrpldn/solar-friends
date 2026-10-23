// Read only the pinned inputs needed by complete walking-clothing reviews.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const walkClothingOutput='assets/art-direction/character-prototype-v1/short-sleeve-relaxed-walk-complete-v1';
export const fileSha256=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
export async function familyWalkClothingFixture(){
 const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',read=async f=>JSON.parse(await readFile(f,'utf8')),ownership=await read(root+'/ownership-v1.json'),materials=await read(root+'/materials-v7.json'),files=await read(root+'/source-files-v1.json'),owners={curls:await read(root+'/complete-parts-v1/hair-curls-v1.json'),sidepart:await read(root+'/complete-parts-v1/hair-sidepart-v1.json')},sourceManifest=await read(root+'/complete-parts-v1/sources-v1.json'),accessories=await read(root+'/accessories-v1/registration-v1.json'),accessorySources=await read(root+'/accessories-v1/sources-v1.json'),manifest=await read(walkClothingOutput+'/sources-v1.json'),served=new Map(),garments=[];
 assert.equal(manifest.schema,1);assert.equal(manifest.poses.length,4);assert.equal(manifest.familyBindingSha256,await fileSha256(root+'/binding-v2.json'));
 async function source(name,path,hash){const bytes=await readFile(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,'Changed review source');const key='/family-source/'+name;if(served.has(key))assert(served.get(key).equals(bytes),'Conflicting review source');else served.set(key,bytes);}
 for(const [id,path]of Object.entries(files))await source('body-'+id,path,ownership.sources[id].sha256);
 for(const owner of Object.values(owners))for(let index=0;index<4;index++){const pose=owner.poses.base[index],s=sourceManifest[pose.file];assert.equal(s.sha256,pose.partSha256);await source(pose.file,s.path,s.sha256);}
 for(const [file,s]of Object.entries(accessorySources))await source(file,s.path,s.sha256);
 for(const [index,p]of manifest.poses.entries()){
  assert.equal(p.sheet,'base');assert.equal(p.index,index);assert(/^[a-z0-9-]+$/.test(p.collection));assert(/^v[1-9][0-9]?$/.test(p.sourceVersion));const folder='assets/art-direction/character-prototype-v1/'+p.collection,regFile=folder+'/registrations-'+p.sourceVersion+'.json';assert.equal(await fileSha256(regFile),p.registrationSha256);assert.equal(await fileSha256(folder+'/review-'+p.sourceVersion+'.json'),p.reviewSha256);const entries=await read(regFile);assert.equal(entries.length,1);assert.equal(entries[0].index,index);const file='shirt-review-'+index+'.png';await source(file,folder+'/candidate-'+p.sourceVersion+'.png',p.sourceSha256);garments.push({file,registration:entries[0]});
 }
 const hashes={};for(const file of [root+'/ownership-v1.json',root+'/materials-v7.json',root+'/complete-parts-v1/hair-curls-v1.json',root+'/complete-parts-v1/hair-sidepart-v1.json',root+'/accessories-v1/registration-v1.json',walkClothingOutput+'/sources-v1.json'])hashes[file]=await fileSha256(file);
 return {data:{ownership,materials,owners,accessories,garments},served,hashes};
}
