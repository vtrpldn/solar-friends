import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const registration=JSON.parse(await readFile(root+'/walk-registration-v3-contacts.json'));
const ownership=JSON.parse(await readFile('assets/art-direction/character-prototype-v1/body-family-relaxed-v1/ownership-v1.json'));
const files=JSON.parse(await readFile('assets/art-direction/character-prototype-v1/body-family-relaxed-v1/source-files-v1.json'));
const sources={};
for(const [id,path]of Object.entries({...files,candidate:root+'/walk-candidate-v3.png'})){
 const bytes=await readFile(path);sources[id]={data:bytes.toString('base64'),sourceHash:hash(bytes)};
}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/contact-atlas-verification`);
 const result=await page.evaluate(async({registration,ownership,sources})=>{
  const {prepareContactAtlasFrames,validateContactAtlasRegistration,bodyTransformContact}=await import('/character-contact-atlas.js');
  const {prepareBodyFamily}=await import('/character-body-family.js');
  const {validateBodyOwnership}=await import('/character-body-ownership.js');
  const {drawResidentAnimation}=await import('/resident-animation.js');
  const {createFamilyBodyMaterialModel}=await import('/character-materials.js');
  const {locateSpriteFrames}=await import('/sprite-frames.js');
  const check=(value,message)=>{if(!value)throw Error(message);};
  const loaded={};for(const [id,source]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+source.data;await image.decode();loaded[id]={image,sourceHash:source.sourceHash};}
  const mutable=structuredClone(registration),prepared=prepareContactAtlasFrames(loaded.candidate,mutable);
  mutable.frames[0].sourceContact[0]=0;mutable.frames[0].nativeContact[0]=0;
  check(prepared.frames.length===4&&JSON.stringify(prepared.contacts[0])==='[128,228]','Preparation borrowed mutable contacts');
  let rejected=0;
  const bad=mutate=>{const r=structuredClone(registration);mutate(r);let failed=false;try{validateContactAtlasRegistration(r);}catch{failed=true;}check(failed,'Malformed atlas registration accepted');rejected++;};
  for(const mutate of [r=>r.schema=2,r=>r.extra=true,r=>r.family='',r=>r.family='Bad Family',r=>r.sheet='unknown',r=>r.source.sha256='bad',r=>r.source.extra=true,r=>r.source.width=0,r=>r.source.height=4097,r=>r.source.columns=1.5,r=>r.source.rows=9,r=>r.uniformScale=0,r=>r.uniformScale=Infinity,r=>r.uniformScale=1.1,r=>r.frames.pop(),r=>r.frames=Array(4),r=>r.frames[0].index=1,r=>r.frames[1]=r.frames[0],r=>r.frames[0].extra=true,r=>r.frames[0].sourceContact=Array(2),r=>r.frames[0].sourceContact=[-1,200],r=>r.frames[0].sourceContact=[0,1255],r=>r.frames[0].sourceContact=[0,NaN],r=>r.frames[0].nativeContact=[0],r=>r.frames[0].nativeContact=[257,200],r=>r.frames[0].nativeContact=[0,Infinity]])bad(mutate);
  const refused=async operation=>{let failed=false;try{await operation();}catch{failed=true;}check(failed,'Invalid atlas operation accepted');};
  await refused(()=>prepareContactAtlasFrames({...loaded.candidate,sourceHash:'0'.repeat(64)},registration));
  const wrong=structuredClone(registration);wrong.source.width--;await refused(()=>prepareContactAtlasFrames(loaded.candidate,wrong));
  // Independently isolate the full atlas, then let putImageData crop it into
  // a bounded source. Source-rectangle sampling of the full atlas takes a
  // different browser resampling path; the contract keeps the bounded cut.
  const source=document.createElement('canvas');source.width=registration.source.width;source.height=registration.source.height;
  const sc=source.getContext('2d',{willReadFrequently:true});sc.drawImage(loaded.candidate.image,0,0);const pixels=sc.getImageData(0,0,source.width,source.height),layout=locateSpriteFrames(pixels.data,source.width,source.height,2,2,0);
  let exactTransforms=0;
  for(let index=0;index<4;index++){
   const figure=layout.frames[index],isolated=document.createElement('canvas');
   const pose=registration.frames[index],scale=registration.uniformScale,left=figure.left-2,top=figure.top-2,width=figure.right-figure.left+4,height=figure.bottom-figure.top+4;
   isolated.width=width;isolated.height=height;
   const ic=isolated.getContext('2d'),part=ic.createImageData(source.width,source.height);
   for(let p=0;p<layout.owners.length;p++)if(layout.owners[p]===figure.id)part.data.set(pixels.data.subarray(p*4,p*4+4),p*4);
   ic.putImageData(part,-left,-top);
   const expected=document.createElement('canvas');expected.width=expected.height=256;
   expected.getContext('2d').drawImage(isolated,pose.nativeContact[0]+(left-pose.sourceContact[0])*scale,pose.nativeContact[1]+(top-pose.sourceContact[1])*scale,width*scale,height*scale);
   const rgba=expected.getContext('2d').getImageData(0,0,256,256).data,actual=prepared.frames[index].getContext('2d').getImageData(0,0,256,256).data;
   const differences=[];for(let i=0;i<rgba.length;i++)if(rgba[i]!==actual[i])differences.push({i,expected:rgba[i],actual:actual[i]});
   check(!differences.length,'Contact atlas differs from its exact isolated affine transform: '+JSON.stringify({index,count:differences.length,first:differences.slice(0,6),max:Math.max(0,...differences.map(d=>Math.abs(d.expected-d.actual)))}));exactTransforms++;
   expected.width=expected.height=isolated.width=isolated.height=0;
  }
  source.width=source.height=0;
  // Failure after the first pose has already prepared must release both the
  // complete output and temporary surfaces, without touching decoded inputs.
  const made=[],create=document.createElement.bind(document);document.createElement=(name,...args)=>{const element=create(name,...args);if(name==='canvas')made.push(element);return element;};
  try{
   const broken=structuredClone(registration);broken.frames[1].nativeContact=[0,0];await refused(()=>prepareContactAtlasFrames(loaded.candidate,broken));
   check(made.length>=3&&made.every(c=>c.width===0&&c.height===0),'Failed atlas retained owned surfaces');
  }finally{document.createElement=create;}
  check(loaded.candidate.image.naturalWidth===registration.source.width,'Failure released a borrowed decoded source');
  const familyOwner=structuredClone(ownership),r=structuredClone(registration);r.family=ownership.family;
  // Distinct valid contacts exercise pose indexing, not only a shared constant.
  for(const [index,contact]of [[1,[130,227]],[2,[126,226]],[3,[129,229]]])r.frames[index].nativeContact=contact;
  familyOwner.sources.walk={sha256:r.source.sha256,width:r.source.width,height:r.source.height,sheet:'base',transform:{method:'contact-atlas-v1',registration:r}};
  validateBodyOwnership(familyOwner);
  let ownershipRefusals=0;for(const mutate of [o=>o.sources.walk.transform.registration.family='other',o=>o.sources.walk.transform.registration.sheet='idle',o=>o.sources.walk.transform.registration.source.sha256='0'.repeat(64),o=>o.sources.walk.transform.extra=true,o=>o.poses.base[0].index=4]){
   const o=structuredClone(familyOwner);mutate(o);await refused(()=>validateBodyOwnership(o));ownershipRefusals++;
  }
  const original=await prepareBodyFamily({ownership,sources:Object.fromEntries(Object.keys(ownership.sources).map(id=>[id,loaded[id]]))});
  const family=await prepareBodyFamily({ownership:familyOwner,sources:{...Object.fromEntries(Object.keys(ownership.sources).map(id=>[id,loaded[id]])),walk:loaded.candidate}});
  let unchanged=0;for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++){
   if(sheet==='base'&&index<4)check(family.binding.frames[sheet][index]!==original.binding.frames[sheet][index],'New gait was substituted with old pixels');
   else{check(family.binding.frames[sheet][index]===original.binding.frames[sheet][index],'Atlas integration changed another body pose');unchanged++;}
  }
  const contact=family.contactForPose('base',0);contact[0]=0;check(family.contactForPose('base',0)[0]===128,'Family contact metadata is mutable');check(family.contactForPose('idle',0)===undefined,'Borrowed sheet gained contact metadata');
  for(let index=0;index<4;index++)check(JSON.stringify(family.contactForPose('base',index))===JSON.stringify(r.frames[index].nativeContact),'Family selected another pose contact');
  const transform=familyOwner.sources.walk.transform,p=bodyTransformContact(transform,0);p[0]=0;check(bodyTransformContact(transform,0)[0]===128,'Contact helper borrowed registration arrays');
  for(const index of [-1,4,.5,'0',NaN])await refused(()=>bodyTransformContact(transform,index));
  let drawComparisons=0;
  for(const facing of [1,-1])for(const width of [48,192])for(let index=0;index<4;index++){
   const actual=document.createElement('canvas'),expected=document.createElement('canvas'),scratch=document.createElement('canvas');actual.width=expected.width=400;actual.height=expected.height=320;scratch.width=scratch.height=256;
   drawResidentAnimation(actual.getContext('2d'),scratch,family,{facing,breath:1,layers:[{sheet:'base',row:0,frame:index,weight:1}]},200,280,width);
   const ctx=expected.getContext('2d'),point=r.frames[index].nativeContact;ctx.translate(200,280);ctx.scale(facing,1);ctx.drawImage(family.frameForPose('base',index),-point[0]*width/256,-point[1]*width/256,width,width);
   const a=actual.getContext('2d').getImageData(0,0,400,320).data,b=expected.getContext('2d').getImageData(0,0,400,320).data;check(a.every((value,i)=>value===b[i]),'Resident painter ignored atlas ground contact');drawComparisons++;
   actual.width=actual.height=expected.width=expected.height=scratch.width=scratch.height=0;
  }
  // Synthetic regions exercise metadata through recolouring. These are not
  // fitted artwork masks and cannot be used to accept new clothing anatomy.
  const sheets=Object.fromEntries(['base','idle','activities'].map(sheet=>[sheet,{regions:Array.from({length:16},()=>({shirtTop:64,waist:140,shoes:210,head:[128,32,26,30]}))}]));
  const materials=await createFamilyBodyMaterialModel(family,{schema:2,body:family.binding,sheets}),coloured=materials.provider();
  for(let index=0;index<4;index++){const contact=coloured.contactForPose('base',index);check(JSON.stringify(contact)===JSON.stringify(r.frames[index].nativeContact),'Colour composition dropped or misindexed atlas contact');contact[0]=0;check(coloured.contactForPose('base',index)[0]===r.frames[index].nativeContact[0],'Coloured contact borrowed registration');check(coloured.frameForPose('base',index).width===256,'Colour composition lost the registered frame');}
  check(coloured.contactForPose('idle',0)===undefined,'Colour composition changed old unregistered pose contacts');materials.clear();
  const digest=crypto.subtle.digest.bind(crypto.subtle),failedSurfaces=[];
  document.createElement=(name,...args)=>{const element=create(name,...args);if(name==='canvas')failedSurfaces.push(element);return element;};
  try{
   crypto.subtle.digest=()=>Promise.reject(Error('Simulated attachment hash failure'));
   await refused(()=>prepareBodyFamily({ownership:familyOwner,sources:{...Object.fromEntries(Object.keys(ownership.sources).map(id=>[id,loaded[id]])),walk:loaded.candidate}}));
   check(failedSurfaces.length>=9&&failedSurfaces.every(c=>c.width===0&&c.height===0),'Failed family binding retained atlas surfaces');
   check(original.frameForPose('idle',0).width===256,'Binding failure cleared borrowed body frames');
  }finally{crypto.subtle.digest=digest;document.createElement=create;}
  const owned=family.frames.base.slice(0,4);family.dispose();family.dispose();check(owned.every(c=>c.width===0&&c.height===0),'Disposed family retained atlas frames');check(original.frameForPose('idle',0).width===256,'Atlas disposal cleared borrowed old sheets');await refused(()=>family.contactForPose('base',0));original.dispose();
  for(const frame of prepared.frames)frame.width=frame.height=0;
  return {rejected,ownershipRefusals,exactTransforms,drawComparisons,unchanged,materialContactPoses:4,invalidContactIndices:5,partialFailureReleased:true,failedFamilyBindingReleased:true,borrowedSourcesPreserved:true,disposedFramesReleased:true,scope:'Actual source atlas transforms and body-family integration, rejection/cleanup, contact-aware rendering and contact propagation through diagnostic recolouring only. Test family mixes old poses with the four new poses and synthetic colour regions for integration coverage; it is not a complete new anatomical family, fitted material art or public appearance.'};
 },{registration,ownership,sources});
 assert.deepEqual(errors,[]);assert.equal(result.rejected,26);assert.equal(result.ownershipRefusals,5);assert.equal(result.exactTransforms,4);assert.equal(result.drawComparisons,16);assert.equal(result.unchanged,44);
 result.inputs={};for(const path of ['web/character-contact-atlas.js','web/character-body-family.js','web/character-body-ownership.js','web/character-materials.js','web/character-family-appearance.js','web/resident-animation.js','scripts/verify-contact-atlas.mjs',root+'/walk-registration-v3-contacts.json'])result.inputs[path]=hash(await readFile(path));
 await writeFile(root+'/contact-atlas-verification-v1.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
