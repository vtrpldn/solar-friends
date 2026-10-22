// Manually chosen draft points from the inspected neutral-body kneeling pose.
// They are not generated approvals or a substitute for all-pose/part review.
import assert from 'node:assert/strict';import {access,readFile,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';import {serve} from './serve.mjs';
const target='web/art/characters/prototype-v1/body-attachments-draft.json',server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100}});await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');await page.locator('#body-attachment-open').click();
 let exists=false;try{await access(target);exists=true;}catch{}if(exists){await page.locator('[data-rig-import]').setInputFiles(target);await page.waitForFunction(()=>document.querySelector('[data-rig-status]').textContent.startsWith('Matching guides loaded.'));}
 await page.locator('[data-rig-sheet]').selectOption('activities');await page.locator('[data-rig-pose]').selectOption({value:'8'});
 for(const [socket,x,y]of [['head',151,111],['neck',148,143],['nearHand',146,214],['farHand',179,176]]){await page.locator('[data-rig-socket]').selectOption(socket);await page.locator('[data-rig-x]').fill(String(x));await page.locator('[data-rig-y]').fill(String(y));await page.locator('[data-rig-place]').click();}
 await page.screenshot({path:'/private/tmp/solar-kneeling-attachment-draft.png'});const pending=page.waitForEvent('download');await page.locator('[data-rig-export]').click();const raw=await readFile(await (await pending).path(),'utf8'),data=JSON.parse(raw);assert.equal(data.poses.activities[8].nearHand.visibility,'visible');await writeFile(target,raw);console.log('PASS: kneeling-pose draft authored/exported through guide controls. Other poses and compatible-part review remain unfinished.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
