// Rebind reviewed, unchanged drawings only after exact pose identity checks.
// New gait attachments and the corrected standing crown have explicit sources.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateAttachmentBinding} from '../web/character-attachments.js';
import {validateBodyForegroundMask} from '../web/character-foreground-mask.js';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',out=root+'/complete-parts-v1',publicRoot='web/art/characters/prototype-v1/';
const read=async path=>JSON.parse(await readFile(path,'utf8')),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),binding=await read(root+'/binding-v2.json'),walking=await read(root+'/hair-registered-v3/registrations-v1.json'),sheets=['base','idle','activities'],sources={},proof={schema:1,family:binding.ownership.family,status:'Internal complete hair/equipment ownership; complete appearance and player integration review still required.',hair:[],equipment:[]};
validateAttachmentBinding(binding);assert.equal(binding.normalization,2);
async function source(file,sha256,path=publicRoot+file){
 assert.match(file,/^[a-z0-9-]+\.png$/);assert.equal(hash(await readFile(path)),sha256,'Source paint differs from registration');
 const value={path,sha256};if(sources[file])assert.deepEqual(sources[file],value,'Ambiguous artwork filename');else sources[file]=value;
}
function unchanged(old,sheet,index){assert.equal(old.frames[sheet][index],binding.frames[sheet][index],'Changed body pose cannot reuse old attachment geometry');}
function mask(old,foreground,sheet,index){
 validateBodyForegroundMask(foreground,old,sheet,index);unchanged(old,sheet,index);
 const next={...structuredClone(foreground),body:binding};validateBodyForegroundMask(next,binding,sheet,index);return next;
}
await mkdir(out,{recursive:true});
const outputs=[];
for(const style of ['curls','sidepart']){
 const old=await read(publicRoot+'hair-'+style+'-all-v1-registration.json');validateAttachmentBinding(old.body);
 const owner={schema:2,sheets:[...sheets],body:binding,poses:{base:{},idle:{},activities:{}}};
 for(const sheet of sheets)for(let index=0;index<16;index++){
  let pose,method='unchanged-frame';
  if(sheet==='base'&&(index<4||style==='sidepart'&&index===8)){
   const entry=walking.find(e=>e.name===style&&e.registration.index===(index===8?0:index));assert(entry);
   assert.deepEqual(entry.registration.body,binding);pose={...structuredClone(entry.registration),file:entry.file,index};delete pose.body;
   if(index===8){unchanged(old.body,sheet,index);pose.placement.targetSocket=[...pose.placement.reference.socket];method='corrected-standing-crown';}else method='registered-walk-socket';
   await source(entry.file,pose.partSha256,entry.sourcePath);
  }else{
   unchanged(old.body,sheet,index);pose=structuredClone(old.poses[sheet][index]);assert.equal(pose.sheet,sheet);assert.equal(pose.index,index);
   if(pose.foreground)pose.foreground=mask(old.body,pose.foreground,sheet,index);
   await source(pose.file,pose.partSha256);
  }
  if(pose.activity){assert.equal(sheet,'base');assert(index>=12);assert.equal(pose.activity.kind,'stool');await source(pose.activity.file,pose.activity.sha256);}
  owner.poses[sheet][index]=pose;proof.hair.push({style,sheet,index,method,bodyFrameSha256:binding.frames[sheet][index],partSha256:pose.partSha256});
 }
 outputs.push(['hair-'+style+'-v1.json',owner]);
}
const equipment=[];
for(let index=0;index<16;index++){
 const file=index<4?`cook-equipment-pose-${index}-v${index===0?3:2}.json`:index<8?`water-equipment-pose-${index}-v${index===7?3:1}.json`:index<12?`tend-equipment-pose-${index}-v${index===11?1:2}.json`:`feed-equipment-pose-${index}-v5.json`,old=await read(publicRoot+file);
 assert.equal(old.sheet,'activities');assert.equal(old.index,index);validateAttachmentBinding(old.body);unchanged(old.body,'activities',index);
 const registration={...structuredClone(old),body:binding,foreground:mask(old.body,old.foreground,'activities',index)};
 await source(registration.file,registration.source.sha256);for(const part of registration.parts??[])await source(part.file,part.source.sha256);
 equipment.push(registration);proof.equipment.push({index,originalRegistration:file,originalSha256:hash(await readFile(publicRoot+file)),bodyFrameSha256:binding.frames.activities[index],method:'unchanged-frame'});
}
outputs.push(['equipment-v1.json',equipment],['sources-v1.json',sources],['ownership-proof-v1.json',proof]);
for(const [file,value]of outputs){const data=JSON.stringify(value,null,2)+'\n';let previous;try{previous=await readFile(out+'/'+file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}if(previous!==undefined)assert.equal(previous,data,'Frozen complete family parts changed; create a new revision');else await writeFile(out+'/'+file,data);}
console.log(`Prepared 96 hair pose records (87 identical-frame reuse, 8 walking sockets, 1 corrected crown), 16 identical-frame equipment registrations and ${Object.keys(sources).length} hash-checked source files.`);
