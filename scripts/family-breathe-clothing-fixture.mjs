// Existing breathing paint is reusable only on byte-identical family body poses.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {familyWalkClothingFixture,fileSha256} from './family-walk-clothing-fixture.mjs';
export const breatheClothingOutput='assets/art-direction/character-prototype-v1/short-sleeve-relaxed-breathe-complete-v1';
export async function familyBreatheClothingFixture(){
 const fixture=await familyWalkClothingFixture(),root='assets/art-direction/character-prototype-v1',bindingPath=root+'/body-family-relaxed-v1/binding-v2.json',binding=JSON.parse(await readFile(bindingPath)),sources=JSON.parse(await readFile(root+'/body-family-relaxed-v1/complete-parts-v1/sources-v1.json')),garments=[];
 async function serve(file,path,hash){const bytes=await readFile(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);fixture.served.set('/family-source/'+file,bytes);}
 for(const index of [8,9,10,11]){
  const folder=root+'/short-sleeve-breathe-single-'+index+'-v1',regPath=folder+'/registrations-v1.json',registrations=JSON.parse(await readFile(regPath));assert.equal(registrations.length,1);const r=registrations[0];assert.equal(r.sheet,'base');assert.equal(r.index,index);assert.equal(r.bodyFrameSha256,binding.frames.base[index],'Breathing garment body changed; repaint rather than rebind');
  const file='shirt-breathe-review-'+index+'.png';await serve(file,folder+'/candidate-v1.png',r.source.sha256);garments.push({file,registration:r});fixture.hashes[regPath]=await fileSha256(regPath);
  for(const owner of Object.values(fixture.data.owners)){const p=owner.poses.base[index],source=sources[p.file];assert.equal(source.sha256,p.partSha256);await serve(p.file,source.path,source.sha256);}
 }
 fixture.data.garments=garments;fixture.hashes[bindingPath]=await fileSha256(bindingPath);return fixture;
}
