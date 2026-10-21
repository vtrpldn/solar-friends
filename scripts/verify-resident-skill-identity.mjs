import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {checkSkillSandboxSave} from './skills-browser-checks.mjs';
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`,output=await mkdtemp('/private/tmp/solar-skill-identity-');let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?dev-scenario=learning');await page.waitForFunction(()=>window.solarDev?.scenario()==='learning'&&window.solarDev.snapshot().village.version===35);
 if(await page.locator('#dev-dialog').isVisible())await page.locator('#dev-close').click();
 const original=await page.evaluate(()=>window.solarDev.snapshot());assert.equal(original.village.skills.schema,2);assert(!Array.isArray(original.village.skills.people));assert.equal(original.village.skills.people['0'].experience[2],100);assert.equal(original.village.skills.people['2'].experience[3],60);
 await page.locator('#resident-strip [data-citizen="0"]').click();await page.locator('.resident-learning summary').click();assert.equal(await page.locator('.skill-entry progress').nth(2).getAttribute('value'),'100');assert.equal(await page.locator('.skill-entry').count(),6);
 await page.locator('.skill-journal>small').scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/solar-resident-skill-identity.png'});
 await page.locator('.close-person').click();await page.locator('#dev-button').click();
 const legacy=structuredClone(original);legacy.village.version=30;legacy.village.skills.schema=1;legacy.village.skills.people=Array.from({length:5},(_,id)=>legacy.village.skills.people[id]);
 legacy.village.skills.people[2].experience[3]=72;
 await page.locator('#dev-import-file').setInputFiles({name:'legacy-village.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
 await page.waitForFunction(()=>window.solarDev.snapshot().village.skills.people['2'].experience[3]===72);
 const migrated=await page.evaluate(()=>window.solarDev.snapshot());const expected=structuredClone(original.village.skills);expected.people[2].experience[3]=72;assert.deepEqual(migrated.village.skills,expected);assert.deepEqual(migrated.residents,original.residents);
 await page.locator('#dev-close').click();await page.locator('#resident-strip [data-citizen="2"]').click();await page.locator('.resident-learning summary').click();assert.equal(await page.locator('.skill-entry progress').nth(3).getAttribute('value'),'72');
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null);
 await checkSkillSandboxSave({browser,base,output,screenshots:[],errors});assert.deepEqual(errors,[]);
 console.log('PASS ID-keyed native skill display, original-person specialties, legacy slot import, unchanged resident runtime state, persistent learning toggles and independent normal saves.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(output,{recursive:true,force:true});}
