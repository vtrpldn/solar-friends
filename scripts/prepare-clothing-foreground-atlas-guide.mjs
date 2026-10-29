// Assemble analytical body/ownership guides only. Generated paint is never read.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const chosen=process.argv.find(a=>a.startsWith('--sources='))?.slice(10),versions=chosen?Object.fromEntries(chosen.split(',').map(s=>{assert(/^(base|idle|activities)-(?:[0-9]|1[0-5]):v[1-9][0-9]?$/.test(s));return s.split(':');})):null;
assert(chosen===undefined||chosen.length>0,'Choose explicit foreground sources');if(versions)assert.equal(Object.keys(versions).length,chosen.split(',').length,'Duplicate foreground poses are ambiguous');
const name=process.argv[2],version=process.argv.find(a=>a.startsWith('--version='))?.slice(10)??'v1';assert(/^[a-z0-9-]+$/.test(name??'')&&/^v[1-9][0-9]?$/.test(version));const root='assets/art-direction/character-prototype-v1/'+name,hash=b=>createHash('sha256').update(b).digest('hex'),intentBytes=await readFile(root+'/registration-intent.json'),intent=JSON.parse(intentBytes),context=await readFile(root+'/context.png'),inputs={'registration-intent.json':hash(intentBytes),'context.png':hash(context)},parts=[];assert.equal(hash(context),intent.guideHashes['context.png']);
if(versions)assert.deepEqual(Object.keys(versions).sort(),intent.poses.filter(p=>p.foregroundRequired).map(p=>p.key).sort(),'Choose every required foreground explicitly');
for(const pose of intent.poses){
 if(!pose.foregroundRequired)continue;
 const tag=pose.key+'-'+(versions?.[pose.key]??version),maskBytes=await readFile(root+'/body-foreground-'+tag+'.json'),mask=JSON.parse(maskBytes),recordBytes=await readFile(root+'/foreground-intent-'+tag+'.json'),record=JSON.parse(recordBytes),image=await readFile(root+'/foreground-context-'+tag+'.png');assert.deepEqual(mask.body,intent.body);assert.equal(mask.sheet,pose.sheet);assert.equal(mask.index,pose.index);assert.equal(record.registrationIntentSha256,hash(intentBytes));assert.equal(record.maskSha256,hash(maskBytes));
 for(const [file,bytes]of [['body-foreground-'+tag+'.json',maskBytes],['foreground-intent-'+tag+'.json',recordBytes],['foreground-context-'+tag+'.png',image]])inputs[file]=hash(bytes);
 parts.push({tile:pose.tile,image:image.toString('base64')});
}
assert(parts.length>0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),png=await page.evaluate(async({context,parts})=>{
  const load=async bytes=>{const image=new Image();image.src='data:image/png;base64,'+bytes;await image.decode();if(image.naturalWidth!==1254||image.naturalHeight!==1254)throw Error('Keep the frozen guide canvas dimensions');return image;},canvas=document.createElement('canvas');canvas.width=canvas.height=1254;
  try{const ctx=canvas.getContext('2d');ctx.drawImage(await load(context),0,0);for(const part of parts){const [x,y,w,h]=part.tile;ctx.clearRect(x,y,w,h);ctx.drawImage(await load(part.image),x,y,w,h,x,y,w,h);}return canvas.toDataURL().split(',')[1];}finally{canvas.width=canvas.height=0;}
 },{context:context.toString('base64'),parts});
 const bytes=Buffer.from(png,'base64'),record=Buffer.from(JSON.stringify({schema:1,status:'Analytical frozen-layout foreground guide; generated garment paint was not read',inputs,sha256:hash(bytes),poseCount:intent.poses.length,foregroundPoseCount:parts.length},null,2)+'\n');for(const [file,data]of [['foreground-atlas-context-'+version+'.png',bytes],['foreground-atlas-context-'+version+'.json',record]]){const prior=await readFile(root+'/'+file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(prior)assert(prior.equals(data),'Changed foreground atlas guide needs a new revision');else await writeFile(root+'/'+file,data);}console.log(JSON.stringify({poses:intent.poses.length,foregroundPoses:parts.length,sha256:hash(bytes)}));
}finally{await browser?.close();}
