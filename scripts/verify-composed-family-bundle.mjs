import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const path='assets/art-direction/character-prototype-v1/body-broad-v1/composed-family-draft-v6.json',bytes=await readFile(path),data=JSON.parse(bytes),sha256=createHash('sha256').update(bytes).digest('hex'),files=new Map();for(const s of Object.values(data.sources))files.set(s.sha256,await readFile(s.path));
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.route(`**/art/characters/${data.id}/**`,route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/bundle-v1.json'))return route.fulfill({status:200,contentType:'application/json',body:bytes});const hash=url.pathname.match(/source-([a-f0-9]{64})\.png$/)?.[1],body=files.get(hash);return body?route.fulfill({status:200,contentType:'image/png',body}):route.fulfill({status:404,body:''});});await page.goto(`http://127.0.0.1:${server.address().port}/bundle-check`);
 const result=await page.evaluate(async({id,sha256})=>{
  const {prepareBundledComposedResidentFamily}=await import('/character-composed-family-bundle.js'),{copyResidentFamilyProvider}=await import('/resident-family-provider.js'),descriptor={id,url:`/art/characters/${id}/bundle-v1.json`,sha256},recipe={schema:3,family:id,hair:'short-curls-v1',hairColour:'chestnut',hat:'straw-v1',facialHair:'short-beard-v1',facialHairColour:'silver',materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}};
  const OriginalImage=window.Image,fetchOriginal=window.fetch,images=[];window.Image=function(){const image=new OriginalImage();images.push(image);return image;};let library=null,lease=null,retained=null,refusals=0;
  const refuse=async fn=>{let failed=false;try{await fn();}catch{failed=true;}if(!failed)throw Error('Invalid bundle accepted');refusals++;};
  try{
   library=await prepareBundledComposedResidentFamily(descriptor,{maxEntries:1,maxConcurrent:1,maxQueued:2});lease=await library.acquire(recipe);retained=copyResidentFamilyProvider(lease.provider);const before=retained.frameForPose('base',8).toDataURL();if(library.info().decodedSources!==39)throw Error('Incomplete source load');lease.release();lease=null;await library.dispose();if(images.some(i=>i.getAttribute('src')!==''))throw Error('Bundle sources retained after close');if(retained.frameForPose('base',8).toDataURL()!==before)throw Error('Bundle close erased copied preview');
   await refuse(()=>prepareBundledComposedResidentFamily({...descriptor,url:'https://example.com/bundle-v1.json'}));await refuse(()=>prepareBundledComposedResidentFamily({...descriptor,sha256:'0'.repeat(64)}));
   let requests=0;const start=images.length;window.fetch=async(...args)=>{if(String(args[0]).includes('/source-')&&++requests===3)return new Response('corrupt');return fetchOriginal(...args);};await refuse(()=>prepareBundledComposedResidentFamily(descriptor));if(images.length-start!==2||images.slice(start).some(i=>i.getAttribute('src')!==''))throw Error('Partial bundle failure leaked decoded images');
   window.fetch=fetchOriginal;const controller=new AbortController();requests=0;const abortStart=images.length;window.fetch=async(...args)=>{if(String(args[0]).includes('/source-')&&++requests===3)controller.abort();return fetchOriginal(...args);};await refuse(()=>prepareBundledComposedResidentFamily(descriptor,{signal:controller.signal}));if(images.length-abortStart!==2||images.slice(abortStart).some(i=>i.getAttribute('src')!==''))throw Error('Cancelled bundle leaked decoded images');
   return {sources:39,poses:50,refusals,retainedAfterClose:true,partialFailureCleanup:true,cancellationCleanup:true};
  }finally{window.fetch=fetchOriginal;window.Image=OriginalImage;lease?.release();await library?.dispose();if(retained){const frames=new Set();for(const s of ['base','idle','activities'])for(let i=0;i<16;i++)frames.add(retained.frameForPose(s,i));for(const i of [13,14])frames.add(retained.frameForPose('activities',i,{sequenceIndex:5}));for(const f of frames)f.width=f.height=0;}}
 },{id:data.id,sha256});assert.equal(result.refusals,4);console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
