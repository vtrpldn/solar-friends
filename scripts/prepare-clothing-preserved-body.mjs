// Derive garment-independent ownership from the exact original body/materials.
// Generated clothing paint is never read or changed by this tool.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const name=process.argv[2],version=process.argv[3]??'v1';assert(/^[a-z0-9-]+$/.test(name??'')&&/^v[1-9][0-9]?$/.test(version));
const root='assets/art-direction/character-prototype-v1/',folder=root+name,familyRoot=root+'body-family-relaxed-v1',read=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex'),intent=await read(folder+'/registration-intent.json'),ownership=await read(familyRoot+'/ownership-v1.json'),files=await read(familyRoot+'/source-files-v1.json'),materialBytes=await readFile(familyRoot+'/materials-v11.json'),materials=JSON.parse(materialBytes),sources={};assert.equal(intent.poses.length,1);
for(const [id,file]of Object.entries(files)){const bytes=await readFile(file);assert.equal(sha(bytes),ownership.sources[id].sha256);sources[id]={sourceHash:sha(bytes),data:bytes.toString('base64')};}
const server=await serve(),browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/clothing-body-ownership`);
 const result=await page.evaluate(async({intent,ownership,materials,sources})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js'),{createFamilyBodyMaterialModel}=await import('/character-materials.js'),{validateBodyForegroundMask}=await import('/character-foreground-mask.js'),{canonical}=await import('/editor/journal.js'),loaded={};
  for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}
  const family=await prepareBodyFamily({ownership,sources:loaded});if(canonical(family.binding)!==canonical(intent.body))throw Error('Body ownership requires the frozen original family');const model=await createFamilyBodyMaterialModel(family,materials,{maxFrames:1});
  try{
   const pose=intent.poses[0],labels=model.mask(pose.sheet,pose.index).labels,runs=[];let pants=0,shoes=0;
   for(let p=0;p<labels.length;){if(labels[p]!==3&&labels[p]!==4){p++;continue;}const start=p;while(p<labels.length&&(labels[p]===3||labels[p]===4)){if(labels[p]===3)pants++;else shoes++;p++;}runs.push([start,p-start]);}
   const mask={schema:2,body:family.binding,sheet:pose.sheet,index:pose.index,size:256,runs};validateBodyForegroundMask(mask,family.binding,pose.sheet,pose.index);if(!pants||!shoes)throw Error('Missing original trousers or shoes');return {mask,pants,shoes,bodyFrameSha256:pose.bodyFrameSha256};
  }finally{model.clear();family.dispose();}
 },{intent,ownership,materials,sources});
 const encoded=Buffer.from(JSON.stringify(result.mask,null,2)+'\n'),record=Buffer.from(JSON.stringify({scope:'Exact original trousers and shoes own their RGBA pixels independently of shirt paint. No skin or shirt labels selected.',bodyFrameSha256:result.bodyFrameSha256,materialRevision:'v11',materialSha256:sha(materialBytes),maskSha256:sha(encoded),pantsPixels:result.pants,shoePixels:result.shoes,generatedPaintRead:false},null,2)+'\n');
 for(const [file,bytes]of [['preserved-body-'+version+'.json',encoded],['preserved-body-intent-'+version+'.json',record]]){const prior=await readFile(folder+'/'+file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(prior)assert(prior.equals(bytes),'Changed ownership needs a new revision');else await writeFile(folder+'/'+file,bytes);}
 console.log({pantsPixels:result.pants,shoePixels:result.shoes,maskSha256:sha(encoded)});
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
