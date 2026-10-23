import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async()=>{
  const {prepareRegisteredHair}=await import('/character-hair.js'),{frames,binding}=window.bodyAttachmentReview,pose=window.lookHairReview.registration.poses[0],image=new Image();image.src='/art/characters/prototype-v1/'+pose.file;await image.decode();
  const source=document.createElement('canvas');source.width=source.height=1254;source.getContext('2d').drawImage(image,0,0);const registration={schema:1,sheet:'idle',index:0,size:1254,partSha256:pose.sha256,body:structuredClone(binding),bounds:[...pose.bounds]},args={body:frames.idle[0],binding},composer=prepareRegisteredHair({registration,image:source,sourceHash:pose.sha256}),pixels=c=>c.getContext('2d').getImageData(0,0,256,256).data,expected=pixels(await composer.compose(args));
  source.getContext('2d').clearRect(0,0,1254,1254);registration.body.frames.idle[0]='0'.repeat(64);registration.bounds.fill(0);
  const same=c=>pixels(c).every((v,i)=>v===expected[i]);if(!same(await composer.compose(args)))throw Error('Prepared hair retained a mutable source or registration alias');
  const returned=await composer.compose(args);returned.getContext('2d').clearRect(0,0,256,256);if(!same(await composer.compose(args)))throw Error('Returned frame changed shared prepared hair');
  for(const hairColour of ['espresso','black','silver'])await composer.compose({...args,hairColour});if(!same(await composer.compose(args)))throw Error('Tint changed shared chestnut source');
  const changed=document.createElement('canvas');changed.width=changed.height=256;changed.getContext('2d').drawImage(frames.idle[0],0,0);changed.getContext('2d').fillRect(0,0,1,1);
  let denied=0;for(const overrides of [{body:frames.idle[1]},{body:changed},{binding:{...binding,size:255}},{appearanceBody:changed},{hairColour:'future'}]){try{await composer.compose({...args,...overrides});throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;denied++;}}
  for(const change of [{sourceHash:'0'.repeat(64)},{registration:{...registration,body:binding,bounds:[0,0,1,1]}}]){try{prepareRegisteredHair({registration:{...registration,body:binding,bounds:pose.bounds},image,sourceHash:pose.sha256,...change});throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;denied++;}}
  return {denied,mutableSourceIsolation:true,returnedFrameIsolation:true,colourIsolation:true};
 });assert.equal(result.denied,7);assert.deepEqual(errors,[]);console.log('PASS: prepared hair isolates source/registration/output/tints and still refuses changed bodies, bindings, alpha, colours, source hashes and bounds.',result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
