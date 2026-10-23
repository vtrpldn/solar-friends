// Register complete accessory reuse without modifying source artwork.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {hatReviewClips} from '../web/character-hat-poses.js';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',out=root+'/accessories-v1',art='web/art/characters/prototype-v1/',read=async file=>JSON.parse(await readFile(file,'utf8')),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),body=await read(root+'/binding-v2.json'),beard=await read(art+'facial-short-chestnut-v1-registration.json'),breathe=await read(art+'straw-hat-breathe-v1-registration.json'),walking=await read(root+'/hair-registered-v3/registrations-v1.json'),referenceBody=beard.body,sources={},hat=[],facialHair=[],proof=[];
assert.deepEqual(referenceBody,breathe.source.body);const reference=[135,27],socket=index=>walking.find(e=>e.name==='curls'&&e.registration.index===index).registration.placement.targetSocket,placement=(sheet,index)=>sheet==='base'&&index<4?{kind:'crown-socket',reference,target:socket(index)}:{kind:'unchanged'},offset=p=>p.kind==='unchanged'?[0,0]:p.target.map((n,i)=>n-p.reference[i]);
const recordSource=async(file,hash)=>{assert.equal(sha(await readFile(art+file)),hash);sources[file]={path:art+file,sha256:hash};};await recordSource(breathe.source.file,breathe.source.sha256);
for(const [clip,spec]of Object.entries(hatReviewClips)){
 const file='straw-hat-'+clip+'-v1-registration.json',old=await read(art+file);assert.deepEqual(old.source,breathe.source);
 for(const index of spec.indices){const p=placement(spec.sheet,index),changed=p.kind!=='unchanged';if(!changed)assert.equal(body.frames[spec.sheet][index],referenceBody.frames[spec.sheet][index]);hat.push({sheet:spec.sheet,index,bodyFrameSha256:body.frames[spec.sheet][index],placement:p,translation:changed?offset(p):old.poses[index].translation});proof.push({part:'hat',sheet:spec.sheet,index,method:p.kind,referenceFile:file,referenceSha256:sha(await readFile(art+file))});}
}
const standing=beard.poses.find(p=>p.registration.sheet==='base'&&p.registration.index===8);
for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++){
 const p=placement(sheet,index),original=p.kind==='unchanged'?beard.poses.find(e=>e.registration.sheet===sheet&&e.registration.index===index):standing;
 if(p.kind==='unchanged')assert.equal(body.frames[sheet][index],referenceBody.frames[sheet][index]);
 facialHair.push({sheet,index,bodyFrameSha256:body.frames[sheet][index],placement:p,translation:offset(p),file:original.file,registration:original.registration});await recordSource(original.file,original.registration.source.sha256);proof.push({part:'facialHair',sheet,index,method:p.kind,referenceSheet:original.registration.sheet,referenceIndex:original.registration.index,referenceBodyFrameSha256:original.registration.bodyFrameSha256});
}
const registration={schema:1,status:'Internal rigid accessory candidate; complete static/motion/world review required before player use.',body,referenceBody,hat:{source:breathe.source,poses:hat},facialHair:{poses:facialHair}};await mkdir(out,{recursive:true});
for(const [file,value]of [['registration-v1.json',registration],['sources-v1.json',sources],['ownership-proof-v1.json',{schema:1,scope:'44 identical target bodies plus 4 explicit walking crown offsets per accessory; all source PNGs unchanged.',poses:proof}]]){const data=JSON.stringify(value,null,2)+'\n';let previous;try{previous=await readFile(out+'/'+file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}if(previous!==undefined)assert.equal(previous,data,'Frozen accessory ownership changed; create another revision');else await writeFile(out+'/'+file,data);}
console.log(`Prepared complete 48-pose hat and beard ownership, ${Object.keys(sources).length} unchanged source files.`);
