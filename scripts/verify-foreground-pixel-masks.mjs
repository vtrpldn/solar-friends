import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {validateBodyForegroundMask} from '../web/character-foreground.js';
const registration=JSON.parse(await readFile('web/art/characters/prototype-v1/feed-equipment-pose-13-v4.json','utf8')),mask=registration.foreground;
assert.equal(validateBodyForegroundMask(mask,mask.body,'activities',13).schema,2);
for(const [name,mutate]of [
 ['version',m=>m.schema=3],['size',m=>m.size=1254],['extra',m=>m.polygons=[]],
 ['empty',m=>m.runs=[]],['too-many',m=>m.runs=Array(2049).fill([0,1])],
 ['negative',m=>m.runs=[[-1,1]]],['fraction',m=>m.runs=[[.1,1]]],
 ['zero',m=>m.runs=[[0,0]]],['negative-length',m=>m.runs=[[0,-1]]],
 ['overflow',m=>m.runs=[[65535,2]]],['overlap',m=>m.runs=[[0,2],[1,2]]],
 ['order',m=>m.runs=[[4,1],[0,1]]],['shape',m=>m.runs=[[0,1,2]]],
 ['null',m=>m.runs=[null]],['pose',m=>m.index=14],
 ['body',m=>m.body.sources.activities='0'.repeat(64)],
 ['sparse-run',m=>m.runs=[[,1]]],['sparse-list',m=>m.runs=Array(1)],
]){const invalid=structuredClone(mask);mutate(invalid);assert.throws(()=>validateBodyForegroundMask(invalid,mask.body,'activities',13),undefined,name);}
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const checked=await page.evaluate(async()=>{
  const {createBodyForegroundLayers}=await import('/character-foreground.js'),binding=window.bodyAttachmentReview.binding,checked=[];
  for(const [index,p]of window.feedingEquipmentReview.poses){
   const {front,back}=await createBodyForegroundLayers({body:window.bodyAttachmentReview.frames.activities[index],binding,appearanceBody:p.painted,mask:p.registration.foreground,sheet:'activities',index}),pixels=c=>c.getContext('2d').getImageData(0,0,256,256).data,original=pixels(p.painted),f=pixels(front),b=pixels(back),owned=new Uint8Array(65536),labels=window.bodyMaterialsReview.model.mask('activities',index).labels;
   for(const [start,length]of p.registration.foreground.runs)owned.fill(1,start,start+length);
   let foreground=0;
   for(let pixel=0;pixel<65536;pixel++){
    const o=pixel*4,yes=owned[pixel];if(yes&&original[o+3])foreground++;
    for(let c=0;c<4;c++){if(f[o+c]!== (yes?original[o+c]:0)||b[o+c]!== (yes?0:original[o+c]))throw Error('Foreground/background ownership changed body pixels or duplicated alpha');}
    if(f[o+3]&&[2,3].includes(labels[pixel]))throw Error('Garment leaked into feeding hand foreground');
   }
   if(foreground<100)throw Error('Foreground mask lost its hand');checked.push({index,foreground});
  }
  return checked;
 });
 assert.deepEqual(checked.map(p=>p.index),[12,13,14,15]);assert.deepEqual(errors,[]);
 console.log('PASS: 18 invalid pixel-mask refusals; exact disjoint RGBA ownership on all four dyed bodies; no garment foreground or duplicated antialiased pixels.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
