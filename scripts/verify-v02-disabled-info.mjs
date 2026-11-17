import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(0),browser=await chromium.launch({headless:true,args:['--mute-audio']});
try {
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/`);
 await page.setContent('<style>#panel{height:240px;width:400px;overflow:auto}button{height:40px}</style><div id="panel"><div style="height:80px"></div><button id="action" disabled data-disabled-reason="Seeds required">Plant</button><div style="height:600px"></div></div>');
 await page.evaluate(async()=>{const {installDisabledInfo}=await import('/v2/weekend/disabled-info.js');installDisabledInfo();});
 const icon=page.locator('.disabled-info');
 await icon.waitFor({state:'visible'});await icon.focus();
 assert(await page.locator('#disabled-action-tooltip').isVisible());
 const during=await page.evaluate(()=>{
  const panel=document.querySelector('#panel');panel.scrollTop=30;panel.dispatchEvent(new Event('scroll'));
  return document.querySelectorAll('.disabled-info:popover-open,.disabled-action-tooltip:popover-open').length;
 });
 assert.equal(during,0,'top-layer hints must disappear synchronously during scroll');
 await icon.waitFor({state:'visible'});
 const aligned=await page.evaluate(()=>{const a=document.querySelector('#action').getBoundingClientRect(),i=document.querySelector('.disabled-info').getBoundingClientRect();return i.top>=a.top&&i.bottom<=a.bottom;});
 assert(aligned,'hint returns attached to the moved control');
 assert.equal(await page.locator('#disabled-action-tooltip').isVisible(),false,'scroll must dismiss focused explanation');
 await page.locator('#panel').evaluate(e=>{e.scrollTop=200;});await page.waitForTimeout(200);
 assert.equal(await icon.isVisible(),false,'clipped controls must not leave floating hints');
 await page.locator('#panel').evaluate(e=>{e.scrollTop=0;});await icon.waitFor({state:'visible'});
 await icon.click();assert(await page.locator('#disabled-action-tooltip').isVisible());
 await page.keyboard.press('Escape');assert.equal(await page.locator('#disabled-action-tooltip').isVisible(),false);
 console.log('PASS scroll dismissal, repositioning, clipping, keyboard and click explanations');
} finally {await browser.close();server.close();}
