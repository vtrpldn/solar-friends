// Manually chosen draft points from all 48 inspected neutral-body poses.
// They are not generated approvals or a substitute for all-pose/part review.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {canonical} from '../web/editor/journal.js';import {bodyAttachmentLandmarks,preparedBindingSha256} from './body-attachment-landmarks.mjs';import {access,readFile,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';import {serve} from './serve.mjs';
const target='web/art/characters/prototype-v1/body-attachments-draft.json',server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100}});await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');await page.locator('#body-attachment-open').click();
 let exists=false;try{await access(target);exists=true;}catch{}if(exists){await page.locator('[data-rig-import]').setInputFiles(target);await page.waitForFunction(()=>document.querySelector('[data-rig-status]').textContent.startsWith('Matching guides loaded.'));}
 const binding=await page.evaluate(()=>window.bodyAttachmentReview.binding);assert.equal(createHash('sha256').update(canonical(binding)).digest('hex'),preparedBindingSha256,'Re-review changed body frames before reusing authored points');
 for(const [sheet,poses]of Object.entries(bodyAttachmentLandmarks)){
  await page.locator('[data-rig-sheet]').selectOption(sheet);
  for(const [index,points]of poses.entries()){
   await page.locator('[data-rig-pose]').selectOption({value:String(index)});
   for(const [i,socket]of ['head','neck','nearHand','farHand'].entries()){await page.locator('[data-rig-socket]').selectOption(socket);await page.locator('[data-rig-x]').fill(String(points[i*2]));await page.locator('[data-rig-y]').fill(String(points[i*2+1]));await page.locator('[data-rig-place]').click();}
  }
  console.log('Authored '+sheet+' attachment coordinates through the guide controls.');
 }
 await page.locator('[data-rig-sheet]').selectOption('activities');await page.locator('[data-rig-pose]').selectOption({value:'8'});
 await page.screenshot({path:'/private/tmp/solar-kneeling-attachment-draft.png'});const pending=page.waitForEvent('download');await page.locator('[data-rig-export]').click();const raw=await readFile(await (await pending).path(),'utf8'),data=JSON.parse(raw);assert.equal(data.poses.activities[8].nearHand.visibility,'visible');assert.equal(Object.values(data.poses).flat().filter(p=>Object.values(p).every(Boolean)).length,48);await writeFile(target,raw);console.log('PASS: all-48 pose coordinates authored/exported through guide controls. Overlay review, compatible parts and occlusion remain separate unfinished gates.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
