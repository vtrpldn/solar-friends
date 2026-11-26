import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
import {serve} from './serve.mjs';
import {restore} from '../web/v02/weekend/simulation.js';
import {village,seedSave} from './fixtures.mjs';
const {s:state}=village({fast:false});
state.view={speed:4,paused:true,position:[20,35,20],target:[1,2,3],zoom:2};
const server=await serve();let browser;
try{
 browser=await launchBrowser();
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await seedSave(page,state,{mute:false});
 await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);
 // Reproduce the production host badge that previously intercepted the options button.
 await page.evaluate(()=>{const badge=document.createElement('iframe');badge.id='nl-badge-frame';badge.title='Hosting badge';badge.style.cssText='position:fixed;bottom:0;right:0;width:202px;height:64px;z-index:2147483645;border:0';document.body.append(badge);});
 await page.locator('.view-menu > summary').click();
 await page.screenshot({path:'/tmp/solar-diagnostics-menu.png'});
 await page.getByRole('button',{name:'Copy bug report',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#diagnostics-status').textContent.startsWith('Bug report copied'));
 const report=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));
 assert.equal(report.format,'solar-friends-diagnostics');assert.equal(report.context.paused,true);assert.equal(report.context.selectedSpeed,4);
 assert.equal(report.state.people.length,state.people.length);assert(restore(JSON.stringify(report.state)));
 assert(report.history.samples.length>0);assert(report.build.revision);
 assert.equal(report.state.time,state.time,'Copying a paused game does not advance it');
 // Exercise both denied clipboard methods and the real manual-copy dialog.
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Permission denied');};document.execCommand=()=>false;});
 await page.getByRole('button',{name:'Copy bug report',exact:true}).click();
 await page.locator('#diagnostics-copy').waitFor({state:'visible'});
 await page.screenshot({path:'/tmp/solar-diagnostics-fallback.png'});
 const fallback=JSON.parse(await page.locator('#diagnostics-text').inputValue());
 assert.deepEqual(fallback.state,report.state);
 assert(await page.locator('#diagnostics-text').evaluate(el=>el.selectionEnd===el.value.length&&el.selectionStart===0));
 await page.locator('#diagnostics-copy').getByRole('button',{name:'Close',exact:true}).click();
 assert.deepEqual(errors,[]);
 console.log('PASS View & options copies parseable reloadable diagnostics through the clipboard; denied access opens selected manual-copy text without advancing the game.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
