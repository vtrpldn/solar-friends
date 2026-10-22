import assert from 'node:assert/strict';import {chromium} from 'playwright';import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.screenshot({path:'/private/tmp/solar-example-picker.png'});await page.locator('[data-example="first-clearing"]').click();await page.locator('#creator-library-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 const first=new URL(page.url()).searchParams.get('project');assert.equal(await page.locator('#creator-title').inputValue(),'First clearing');await page.locator('#creator-title').fill('My own clearing');await page.locator('#creator-title').blur();
 await page.locator('#creator-library').click();await page.locator('#creator-library-dialog').waitFor({state:'visible'});await page.locator('[data-example="first-clearing"]').click();await page.locator('#creator-library-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
 const second=new URL(page.url()).searchParams.get('project');assert.notEqual(first,second);assert.equal(await page.locator('#creator-title').inputValue(),'First clearing');
 const records=await page.evaluate(async first=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{return {title:(await l.getProject(first)).title,count:(await l.listProjects()).length};}finally{l.close();}},first);assert.deepEqual(records,{title:'My own clearing',count:2});
 await page.locator('#creator-test').click();await page.waitForURL(/\?run=/);await page.waitForFunction(()=>window.solarDev);
 const opening=await page.evaluate(()=>{const state=window.solarDev.snapshot();return typeof state==='string'?JSON.parse(state):state;});assert.equal(opening.village.scenario.definition.title,'First clearing');assert.equal(opening.village.scenario.definition.journal.chapters.length,4);
 assert.deepEqual(errors,[]);console.log('PASS: public example picker opens independent editable copies, preserves prior edits and launches the real isolated playtest with all four chapters.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
