import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
import {serve} from './serve.mjs';
const server=await serve(0,{handle(req,res,path){if(path!=='/disabled-info-test')return false;res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><html><head></head><body></body></html>');return true;}}),browser=await launchBrowser();
try {
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/disabled-info-test`);
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
 // Exercise native control geometry and CSS-hidden panels, not just buttons.
 await page.locator('#panel').evaluate(panel=>{panel.innerHTML='<label id="check-label"><input id="check" type="checkbox" disabled title="Wait for queued work"><span>Care settings</span></label><select id="choice" disabled><option>Wide spacing</option></select><input id="amount" type="number" disabled value="12"><div id="clip" style="width:50px;overflow:hidden"><button id="clipped" style="width:180px" disabled>Clipped action</button></div>';});
 await page.addStyleTag({content:'#check-label{display:flex;align-items:center;gap:8px}#choice,#amount{width:180px;height:38px;margin:10px 0;display:block;box-sizing:border-box}'});
 await page.waitForFunction(()=>document.querySelectorAll('.disabled-info:popover-open').length===3);
 const geometry=()=>{
  const boxes=[...document.querySelectorAll('.disabled-info:popover-open')].map(e=>e.getBoundingClientRect());
  const box=id=>document.getElementById(id).getBoundingClientRect();
  const check=box('check'),label=document.querySelector('#check-label span').getBoundingClientRect();
  const checkbox=boxes.some(i=>i.left>=check.right&&i.right<=label.left&&Math.abs((i.top+i.bottom-check.top-check.bottom)/2)<1);
  const arrows=['choice','amount'].every(id=>boxes.some(i=>i.left>box(id).left&&i.right<=box(id).right-20&&Math.abs(i.top-box(id).top-(box(id).height-18)/2)<1));
  const padding=['choice','amount'].every(id=>parseFloat(getComputedStyle(document.getElementById(id)).paddingRight)>=48);
  return checkbox&&arrows&&padding;
 };
 await page.waitForFunction(geometry);
 await page.locator('#choice').evaluate(e=>e.style.height='60px');
 await page.waitForFunction(geometry);
 const careHint=page.getByRole('button',{name:'Why unavailable: Wait for queued work',exact:true});
 await careHint.focus();assert.equal(await page.locator('#disabled-action-tooltip').innerText(),'Wait for queued work');
 await page.locator('#panel').evaluate(e=>e.style.visibility='hidden');
 await page.waitForFunction(()=>!document.querySelector('.disabled-info:popover-open'));
 assert(!await page.locator('#disabled-action-tooltip').isVisible(),'CSS-hidden controls dismiss their explanation');
 await page.locator('#panel').evaluate(e=>e.style.visibility='visible');
 await careHint.waitFor({state:'visible'});
 await page.locator('#check').evaluate(e=>e.disabled=false);
 await careHint.waitFor({state:'detached'});
 assert.equal(await page.locator('#check').evaluate(e=>e.classList.contains('has-disabled-info')),false);
 console.log('PASS native arrows, checkbox spacing, horizontal clipping, CSS visibility, title explanations and re-enabled controls');
 console.log('PASS scroll dismissal, repositioning, clipping, keyboard and click explanations');
} finally {await browser.close();server.close();}
