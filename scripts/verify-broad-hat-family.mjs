// Candidate material review only; no public family or artwork edits.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const revision='v2',margins=process.argv.includes('--margins'),fitted=process.argv.includes('--fitted'),occlusion=process.argv.includes('--occlusion');
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(root+'/'+p));
const ownership=await read('body-ownership-v1.json'),binding=await read('body-binding-v1.json'),registration=await read(`body-material-regions-${revision}.json`),rig=await read(`attachment-rig-draft-${revision}.json`),sourceMap=await read('body-sources-v1.json'),sources={};
for(const [id,s]of Object.entries(sourceMap)){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);sources[id]={sourceHash:s.sha256,data:bytes.toString('base64')};}
const hatRegistration=JSON.parse(await readFile('web/art/characters/prototype-v1/straw-hat-breathe-v1-registration.json'));const hatSource=hatRegistration.source;const hatBytes=await readFile('web/art/characters/prototype-v1/'+hatSource.file);assert.equal(hash(hatBytes),hatSource.sha256);const hatData=hatBytes.toString('base64');
const hatFamilyRegistration=await read('hat-family-registration-draft-v1.json'),review=await read('hat-fit-diagnostic-v4.json');
const server=await serve(0);let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/hat-family-check`);
 const result=await page.evaluate(async({ownership,binding,sources,hatData,hatFamilyRegistration,review})=>{
 const {prepareBodyFamily}=await import('/character-body-family.js');const {prepareHatFamily}=await import('/character-hat-family.js');const {composeResidentFrame}=await import('/character-frame-composition.js');const {createBodyForegroundLayers}=await import('/character-foreground.js');
 const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}const family=await prepareBodyFamily({ownership,sources:loaded});const image=new Image();image.src='data:image/png;base64,'+hatData;await image.decode();const source={image,sourceHash:hatFamilyRegistration.source.sha256},provider=await prepareHatFamily({family,registration:hatFamilyRegistration,source});let compared=0,refusals=0;const owned=[];
 try{const hat=document.createElement('canvas');hat.width=hat.height=256;hat.getContext('2d').drawImage(image,0,0,256,256);
 for(const f of review.fits){const {sheet,pose:index}=f,actual=provider.frameForPose(sheet,index);if(f.kind==='not-worn'){if(actual!==family.frameForPose(sheet,index))throw Error('Unworn hat changed body');compared++;continue;}
 const polygons=review.foregroundPolygons[sheet+':'+index],split=polygons?await createBodyForegroundLayers({body:family.frameForPose(sheet,index),binding,sheet,index,mask:{schema:1,body:binding,sheet,index,size:1254,polygons:polygons.map(poly=>poly.map(p=>p.map(n=>n*1254/256)))}}):null;
 const expected=composeResidentFrame(split?.back??family.frameForPose(sheet,index),[{frame:hat,offset:f.offset},...(split?[{frame:split.front,offset:[0,0]}]:[])]);if(actual.width!==expected.frame.width||actual.height!==expected.frame.height||JSON.stringify(provider.frameOriginForPose(sheet,index))!==JSON.stringify(expected.origin))throw Error('Registered hat transform differs from reviewed fit');const a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data,b=expected.frame.getContext('2d').getImageData(0,0,actual.width,actual.height).data;if(a.some((n,i)=>n!==b[i]))throw Error('Registered hat differs from reviewed pixels');expected.frame.width=expected.frame.height=0;if(split)split.back.width=split.back.height=split.front.width=split.front.height=0;owned.push(actual);compared++;}
 hat.width=hat.height=0;
 for(const mutate of [r=>r.poses.pop(),r=>r.poses[1]=r.poses[0],r=>r.poses[0].offset=[129,0],r=>r.poses[0].bodyFrameSha256='0'.repeat(64),r=>r.source.sha256='0'.repeat(64)]){const r=structuredClone(hatFamilyRegistration);mutate(r);try{const p=await prepareHatFamily({family,registration:r,source});p.dispose();}catch{refusals++;}}
 const origin=provider.frameOriginForPose('base',0);origin[0]=999;if(provider.frameOriginForPose('base',0)[0]===999)throw Error('Origin escaped ownership');provider.dispose();provider.dispose();if(owned.some(c=>c.width||c.height)||family.frameForPose('base',15).width!==256)throw Error('Hat disposal ownership failure');for(const method of ['frameForPose','frameOriginForPose','contactForPose','shadowForPose'])try{provider[method]('base',0);}catch{refusals++;}
 return {compared,refusals,ownedReleased:owned.length};}finally{provider.dispose();family.dispose();}
 },{ownership,binding,sources,hatData,hatFamilyRegistration,review});assert.deepEqual(result,{compared:48,refusals:9,ownedReleased:47});console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
