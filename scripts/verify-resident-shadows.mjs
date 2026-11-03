import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const files=['scripts/verify-resident-shadows.mjs','web/resident-ground-shadow.js','web/resident-shadow-metadata.js','web/character-body-family.js','web/character-family-appearance.js','web/resident-family-provider.js','web/main.js'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),inputs=Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await readFile(file))])));
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/resident-shadow-check`);
 const result=await page.evaluate(async()=>{
  const {paintResidentShadow}=await import('/resident-ground-shadow.js'),{paintContactShadow}=await import('/world-renderer.js'),{registeredBodyShadow,copyResidentShadow}=await import('/resident-shadow-metadata.js');
  const check=(v,m)=>{if(!v)throw Error(m);},canvas=()=>Object.assign(document.createElement('canvas'),{width:512,height:512}),equal=(a,b)=>a.toDataURL()===b.toDataURL(),registration={source:{sha256:'50958453c8bf8c12defcacb2c75943be77a57b0ff17c72793040186dd9621f5e'},uniformScale:.199,sourceContact:[640,810],nativeContact:[128,164]},shape=registeredBodyShadow(registration),pose={sheet:'base',row:3,frame:3,weight:1};let legacy=0,custom=0,refused=0;
  check(shape?.radius[0]===110,'Known source missing');for(const change of [{source:{sha256:'0'.repeat(64)}},{uniformScale:.2},{nativeContact:[128,180]},{sourceContact:[640,811]}])check(registeredBodyShadow({...registration,...change})===undefined,'Unreviewed source inherited shadow');
  for(const facing of [-1,1])for(const width of [48,160])for(const method of ['crossfade','keyframes']){
   const a=canvas(),b=canvas(),animation={layers:[pose],facing,breath:1},defaults={rx:10,ry:4,offsetY:2,opacity:.25};
   paintContactShadow(a.getContext('2d'),256,258,10,4,.25);paintResidentShadow(b.getContext('2d'),{interpolation:method},animation,256,256,width,defaults);check(equal(a,b),'Legacy shadow changed');legacy++;
   a.getContext('2d').clearRect(0,0,512,512);b.getContext('2d').clearRect(0,0,512,512);
   const ctx=a.getContext('2d');ctx.save();ctx.translate(256,256);ctx.scale(facing,1);ctx.rotate(-Math.atan(.5));paintContactShadow(ctx,0,0,110*width/256,18*width/256,.25);ctx.restore();
   paintResidentShadow(b.getContext('2d'),{interpolation:method,contactForPose:()=>[128,164],shadowForPose:()=>shape},animation,256,256,width,defaults);check(equal(a,b),'Registered shadow moved off its ground axis');custom++;
  }
  for(const value of [null,{}, {...shape,center:Array(2)}, {...shape,radius:Array(2)}, {...shape,center:[NaN,1]}, {...shape,radius:[0,1]}, {...shape,radius:[129,1]}, {...shape,angle:Infinity}, {...shape,extra:true}]){let failed=false;try{copyResidentShadow(value);}catch{failed=true;}check(failed,'Invalid shadow accepted');refused++;}
  const defaultA=canvas(),defaultB=canvas();paintContactShadow(defaultA.getContext('2d'),256,258,10,4,.25);
  paintResidentShadow(defaultB.getContext('2d'),{shadowForPose:()=>undefined},{layers:[{...pose,weight:.4},{...pose,frame:2,weight:.6}],facing:1},256,256,48,{rx:10,ry:4,offsetY:2,opacity:.25});check(equal(defaultA,defaultB),'Legacy blend painted the default shadow twice');legacy++;
  const copied=copyResidentShadow(shape);copied.center[0]=0;check(shape.center[0]===128,'Metadata aliases source');
  let asked=0;paintResidentShadow(canvas().getContext('2d'),{contactForPose:()=>[128,164],shadowForPose:()=>{asked++;return shape;}},{layers:[pose,{...pose,weight:0}],facing:1},256,256,48,{rx:10,ry:4});check(asked===1,'Invisible pose requests shadow');
  const {copyResidentFamilyProvider}=await import('/resident-family-provider.js'),frame=Object.assign(document.createElement('canvas'),{width:256,height:256}),create=document.createElement.bind(document);let retentionRefusals=0;
  for(const invalid of [{shadowForPose:'bad'}, {shadowForPose:()=>shape}, {contactForPose:()=>[128,164],shadowForPose:()=>({...shape,radius:[0,18]})}]){
   const created=[];document.createElement=(name,...args)=>{const c=create(name,...args);if(name==='canvas')created.push(c);return c;};let denied=false;
   try{copyResidentFamilyProvider({frameForPose:()=>frame,...invalid});}catch{denied=true;}finally{document.createElement=create;}
   check(denied&&created.every(c=>c.width===0&&c.height===0),'Malformed retained shadow leaked frames');check(frame.width===256,'Borrowed source was disposed');retentionRefusals++;
  }
  return {legacyExactComparisons:legacy,registeredAxisComparisons:custom,malformedRefusals:refused,sourceChangesRefused:4,retentionRefusals,metadataCopied:true,invisibleLayersSkipped:true};
 });assert.equal(result.registeredAxisComparisons,8);for(const file of files)assert.equal(sha(await readFile(file)),inputs[file],'Input changed during verification');await writeFile('assets/art-direction/character-prototype-v1/sleep-body-study-v2/family-v1/shadow-verification-v1.json',JSON.stringify({...result,inputs,scope:'Exact shadow geometry and retained metadata validation; static board reviewed separately. World terrain, environmental lighting, motion and public activation remain open.'},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
