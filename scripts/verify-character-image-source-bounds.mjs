import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const bytes=await readFile('web/art/characters/prototype-v1/hair-sidepart-base-8-candidate-v1.png'),sha256=createHash('sha256').update(bytes).digest('hex'),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/source-test`);
 const result=await page.evaluate(async({sha256,width,height})=>{
  const {loadCharacterImageSource}=await import('/character-image-source.js'),{readCharacterBundleBytes}=await import('/character-bundle-response.js');
  const url='/art/characters/prototype-v1/hair-sidepart-base-8-candidate-v1.png',originalFetch=window.fetch,OriginalImage=window.Image,originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;let created=0,revoked=0,decoded=0,refusals=0,cancelled=0;
  URL.createObjectURL=(...a)=>{created++;return originalCreate(...a);};URL.revokeObjectURL=(...a)=>{revoked++;return originalRevoke(...a);};window.Image=function(){decoded++;return new OriginalImage();};
  const refuse=async(run)=>{let failed=false;try{await run();}catch{failed=true;}if(!failed)throw Error('Malformed source accepted');refusals++;};
  try{
   const source=await loadCharacterImageSource(url,{sha256,width,height});if(source.sourceHash!==sha256||source.image.naturalWidth!==width)throw Error('Source decode changed');source.dispose();source.dispose();if(source.image.getAttribute('src')!=='')throw Error('Source disposal retained image');
   const initialDecodes=decoded;
   await refuse(()=>loadCharacterImageSource(url,{sha256:'0'.repeat(64)}));await refuse(()=>loadCharacterImageSource(url,{width:width===1?2:1}));await refuse(()=>loadCharacterImageSource(url,{maximumBytes:1}));await refuse(()=>loadCharacterImageSource(url,{width:4096}));
   if(decoded!==initialDecodes)throw Error('Rejected metadata reached image decode');
   const aborted=new AbortController();aborted.abort();await refuse(()=>loadCharacterImageSource(url,{signal:aborted.signal}));
   window.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(3));c.enqueue(new Uint8Array(3));},cancel(){cancelled++;}}));
   await refuse(()=>readCharacterBundleBytes('/chunked',{maximumBytes:5}));if(cancelled!==1)throw Error('Oversized stream not cancelled');
   window.fetch=async()=>new Response('bad',{headers:{'content-length':'invalid'}});await refuse(()=>readCharacterBundleBytes('/length',{maximumBytes:10}));
   window.fetch=async()=>new Response(new Uint8Array(40));await refuse(()=>loadCharacterImageSource('/invalid'));
   const header=new Uint8Array(33),view=new DataView(header.buffer);header.set([137,80,78,71,13,10,26,10]);view.setUint32(8,13);view.setUint32(12,0x49484452);view.setUint32(16,4096);view.setUint32(20,1);window.fetch=async()=>new Response(header);await refuse(()=>loadCharacterImageSource('/oversized-png'));
   view.setUint32(16,1);await refuse(()=>loadCharacterImageSource('/corrupt-png'));if(created!==revoked)throw Error('Blob URL leaked on decode failure');
   window.fetch=originalFetch;
   const active=new AbortController();window.Image=function(){decoded++;const image=new OriginalImage(),decode=image.decode.bind(image);image.decode=async()=>{await decode();active.abort();};return image;};await refuse(()=>loadCharacterImageSource(url,{signal:active.signal}));
   if(created!==revoked)throw Error('Aborted source leaked Blob URL');return {refusals,cancelled,created,revoked,successfulDecode:true,metadataRejectedBeforeDecode:true};
  }finally{window.fetch=originalFetch;window.Image=OriginalImage;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;}
 },{sha256,width,height});assert.equal(result.refusals,11);assert.equal(result.created,result.revoked);console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
