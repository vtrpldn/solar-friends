import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {validateEquipmentParts,loadEquipmentArt} from '../web/character-equipment-parts.js';
const recipe=JSON.parse(await readFile('web/art/characters/prototype-v1/feed-equipment-pose-13-v3.json','utf8'));
assert.equal(validateEquipmentParts(recipe).length,2);
for(const [name,change]of [
 ['version',r=>r.schema=1],['empty',r=>r.parts=[]],['too-many',r=>r.parts=Array(5).fill(r.parts[0])],
 ['duplicate-id',r=>r.parts[1].id=r.parts[0].id],['external',r=>r.parts[1].file='https://example.com/art.png'],
 ['traversal',r=>r.parts[1].file='../art.png'],['hash',r=>r.parts[1].source.sha256='bad'],
 ['size',r=>r.parts[1].source.width--],['offset-shape',r=>r.parts[1].offset=[0]],
 ['fractional-offset',r=>r.parts[1].offset[0]=.5],['destination-clipping',r=>r.parts[1].offset[0]=-2000],
 ['source-clipping',r=>r.parts[1].rect[0]=2000],['empty-region',r=>r.parts[1].rect[2]=0],
 ['rotation',r=>r.parts[1].rotation=15],['scaling',r=>r.parts[1].scale=1.1],
 ['primary-identity',r=>r.parts[0].source.sha256='0'.repeat(64)],
]){const invalid=structuredClone(recipe);change(invalid);assert.throws(()=>validateEquipmentParts(invalid),undefined,name);}
let invalidRequests=0;
for(const invalid of [{...recipe,schema:3},{...recipe,schema:1},{...recipe,parts:[]}])await assert.rejects(loadEquipmentArt(invalid,async()=>{invalidRequests++;throw Error('Invalid recipes must fail before loading artwork');}));
assert.equal(invalidRequests,0);
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/feeding-basket-pose-14-candidate-v2.png'))requests.push(r.url());});
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async()=>{
  const {registeredEquipmentFrame}=await import('/character-equipment.js'),review=window.feedingEquipmentReview,r=review.poses.get(13),args={body:window.bodyAttachmentReview.frames.activities[13],binding:window.bodyAttachmentReview.binding,appearanceBody:r.painted,appearanceFrame:r.hairFrame,equipment:r.equipment,registration:r.registration,sheet:'activities',index:13},refused=[];
  for(const [label,mutate]of [
   ['missing',a=>a.equipment.parts=a.equipment.parts.slice(0,1)],
   ['file',a=>a.equipment.parts[1].file='other.png'],
   ['hash',a=>a.equipment.parts[1].sourceHash='0'.repeat(64)],
   ['image',a=>a.equipment.parts[1].image=new Image()],
   ['old-format-parts',a=>a.registration.schema=1],
  ]){const a={...args,registration:structuredClone(r.registration),equipment:{...r.equipment,parts:r.equipment.parts.map(p=>({...p}))}};mutate(a);try{await registeredEquipmentFrame(a);}catch{refused.push(label);}}
  const poses=[...review.poses].map(([index,p])=>({index,basket:p.registration.parts[0],source:p.equipment.parts[0].image}));
  return {refused,identity:new Set(poses.map(p=>JSON.stringify([p.basket.file,p.basket.source,p.basket.rect]))).size,sharedDecodedImage:poses.every(p=>p.source===poses[0].source),offsets:poses.map(p=>p.basket.offset)};
 });
 assert.deepEqual(result.refused,['missing','file','hash','image','old-format-parts']);assert.equal(result.identity,1);assert(result.sharedDecodedImage);assert.deepEqual(result.offsets,[[-28,-39],[15,-15],[0,0],[15,0]]);assert.equal(requests.length,1);assert.deepEqual(errors,[]);
 console.log('PASS: 16 invalid part recipes, five mismatched-source refusals, one shared painted/decoded basket across four authored placements, and exactly one basket request.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
