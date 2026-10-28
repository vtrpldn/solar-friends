import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 const first=await readFile('web/art/characters/prototype-v1/hair-curls-activities-8-candidate-v1.png'),second=await readFile('web/art/characters/prototype-v1/hair-curls-activities-9-candidate-v1.png');
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);let requests=0;
 await page.route('**/changing-character.png',route=>route.fulfill({status:200,contentType:'image/png',body:requests++===0?first:second}));
 await page.route('**/invalid-character.png',route=>route.fulfill({status:200,contentType:'image/png',body:first.subarray(0,33)}));
 await page.route('**/missing-character.png',route=>route.fulfill({status:404,body:'missing'}));
 const result=await page.evaluate(async()=>{
  const {loadCharacterImageSource}=await import('/character-image-source.js');
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL,created=[],revoked=[];
  URL.createObjectURL=function(blob){const url=create.call(URL,blob);created.push(url);return url;};URL.revokeObjectURL=function(url){revoked.push(url);return revoke.call(URL,url);};
  try{
   const loaded=await loadCharacterImageSource('/changing-character.png');
   const c=document.createElement('canvas');c.width=c.height=1254;c.getContext('2d').drawImage(loaded.image,0,0);
   const pixels=c.getContext('2d').getImageData(0,0,1254,1254).data;
   const pixelHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(n=>n.toString(16).padStart(2,'0')).join('');
   const expected=new Image();expected.src='/art/characters/prototype-v1/hair-curls-activities-8-candidate-v1.png';await expected.decode();c.getContext('2d').clearRect(0,0,1254,1254);c.getContext('2d').drawImage(expected,0,0);
   const expectedHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',c.getContext('2d').getImageData(0,0,1254,1254).data))].map(n=>n.toString(16).padStart(2,'0')).join('');
   const retainedHash=expectedHash;loaded.dispose();loaded.dispose();if(loaded.image.naturalWidth!==0||expected.naturalWidth!==1254)throw Error('Owned image disposal changed a borrowed source or left the decoded image live');const retainedPixels=c.getContext('2d').getImageData(0,0,1254,1254).data,afterDispose=[...new Uint8Array(await crypto.subtle.digest('SHA-256',retainedPixels))].map(n=>n.toString(16).padStart(2,'0')).join('');if(afterDispose!==retainedHash)throw Error('Disposal erased copied pixels');
   const refused=[];for(const path of ['/invalid-character.png','/missing-character.png'])try{await loadCharacterImageSource(path);}catch(error){if(path==='/invalid-character.png'&&!error.message.includes(path))throw Error('Decode failure lost its source path');if(path==='/invalid-character.png'&&!error.cause)throw Error('Decode failure lost its original cause');refused.push(path);}
   return {ownedSourceReleased:true,borrowedSourcePreserved:true,copiedPixelsPreserved:true,sourceHash:loaded.sourceHash,pixelHash,expectedHash,created,revoked,refused};
  }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
 });
 assert.equal(result.ownedSourceReleased,true);assert.equal(result.copiedPixelsPreserved,true);assert.equal(requests,1);assert.equal(result.sourceHash,createHash('sha256').update(first).digest('hex'));assert.equal(result.pixelHash,result.expectedHash);assert.equal(result.created.length,2);assert.deepEqual(result.revoked,result.created);assert.deepEqual(result.refused,['/invalid-character.png','/missing-character.png']);console.log('PASS: one response owns hash and decoded pixels; object URLs released on success/failure; HTTP/decode failures refused; idempotent decoded-image disposal preserves borrowed sources and copied pixels.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
