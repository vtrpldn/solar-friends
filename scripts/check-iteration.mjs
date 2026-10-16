import {chromium} from 'playwright';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const file=new URL('../src/lib.rs',import.meta.url),source=await readFile(file,'utf8');
const jsFile=new URL('../web/frame-state.js',import.meta.url),jsSource=await readFile(jsFile,'utf8');
try{
 await page.goto((process.env.DEV_URL||'http://127.0.0.1:4173')+'/?dev-scenario=autonomy&performance');await page.waitForFunction(()=>window.solarDevReloadReady);
 await page.locator('#dev-close').click();await page.evaluate(()=>window.solarDev.run());
 await page.waitForFunction(()=>window.solarPerformance.report().samples>=90,null,{timeout:60000});
 const perf=await page.evaluate(()=>window.solarPerformance.report());
 assert(perf.frameInterval.median>0&&perf.frameInterval.median<100,'The real frame cadence must remain responsive, including time outside JavaScript');
 const runningAt=await page.evaluate(()=>window.solarDev.snapshot().village.minutes);
 const runningLoad=page.waitForEvent('load');await writeFile(jsFile,jsSource+'\n// Running-scene reload probe.\n');await runningLoad;await page.waitForFunction(()=>window.solarDevReloadReady);
 assert.equal(await page.locator('#dev-dialog').evaluate(el=>el.open),false,'A running scene must not reopen a blocking developer dialog');
 await page.waitForFunction(minutes=>window.solarDev.snapshot().village.minutes>minutes,runningAt);
 await page.locator('#pause').click();

 const before=await page.evaluate(()=>window.solarDev.snapshot());
 const started=Date.now();await writeFile(file,source+'\n// Live-rebuild checkpoint probe.\n');
 await page.waitForEvent('load',{timeout:60000});await page.waitForFunction(()=>window.solarDevReloadReady);
 const after=await page.evaluate(()=>window.solarDev.snapshot());
 const result={runningRecovery:true,profile:'iteration',frame:perf,editToReadyMs:Date.now()-started,checkpoint:JSON.stringify(before)===JSON.stringify(after),browserErrors:errors};
 await writeFile(new URL('../artifacts/isometric/browser-performance.json',import.meta.url),JSON.stringify(result,null,2));
 if(!result.checkpoint){await writeFile('/private/tmp/solar-reload-before.json',JSON.stringify(before));await writeFile('/private/tmp/solar-reload-after.json',JSON.stringify(after));}
 // A compiler error must not reload or replace the last working WASM.
 await page.evaluate(()=>{window.iterationEvents=[];const events=new EventSource('/__dev/events');events.onmessage=e=>window.iterationEvents.push(JSON.parse(e.data));});
 let loads=0;page.on('load',()=>loads++);
 await writeFile(file,source+'\nthis is deliberately invalid Rust for the rebuild check\n');
 await page.waitForFunction(()=>window.iterationEvents.some(e=>e.status==='error'),null,{timeout:60000});
 assert.equal(loads,0,'A failed build must leave the current page running');
 assert.deepEqual(await page.evaluate(()=>window.solarDev.snapshot()),after);
 result.failedBuildPreserved=true;
 const ready=page.waitForEvent('load',{timeout:60000});await writeFile(file,source);await ready;await page.waitForFunction(()=>window.solarDevReloadReady);
 assert.deepEqual(await page.evaluate(()=>window.solarDev.snapshot()),after,'Recovery rebuild preserves the checkpoint');
 await writeFile(new URL('../artifacts/isometric/browser-performance.json',import.meta.url),JSON.stringify(result,null,2));
 const brokenLoad=page.waitForEvent('load');await writeFile(jsFile,jsSource+'\nconst = ; // deliberate syntax-error recovery probe\n');await brokenLoad;
 await page.waitForFunction(()=>!window.solarDevReloadReady);
 const fixedLoad=page.waitForEvent('load');await writeFile(jsFile,jsSource);await fixedLoad;await page.waitForFunction(()=>window.solarDevReloadReady);
 assert.deepEqual(await page.evaluate(()=>window.solarDev.snapshot()),after,'A fixed JavaScript boot error must restore the last working checkpoint');
 result.javascriptRecovery=true;
 result.browserErrors=errors.filter(e=>!e.includes("Unexpected token '='"));
 await writeFile(new URL('../artifacts/isometric/browser-performance.json',import.meta.url),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
 assert(result.checkpoint,'Exact paused checkpoint');assert.deepEqual(result.browserErrors,[]);
 // Protected scenes must keep the playable parent's save destination.
 await page.goto((process.env.DEV_URL||'http://127.0.0.1:4173')+'/');await page.waitForFunction(()=>window.solarDevReloadReady);
 await page.locator('[data-new-mode="sandbox"]').click();await page.waitForFunction(()=>!document.querySelector('#main-menu').open);
 if((await page.locator('#pause').getAttribute('aria-label')).includes('Pause'))await page.locator('#pause').click();
 const parent=await page.evaluate(()=>window.solarDev.snapshot()),storySave=await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story'));
 await page.evaluate(()=>window.solarDev.loadScenario('autonomy'));
 const parentLoad=page.waitForEvent('load');await writeFile(jsFile,jsSource+'\n// Protected Sandbox parent reload probe.\n');await parentLoad;await page.waitForFunction(()=>window.solarDevReloadReady);
 await page.evaluate(()=>{window.solarDev.returnToVillage();window.dispatchEvent(new Event('pagehide'));});
 assert.deepEqual(await page.evaluate(()=>window.solarDev.snapshot()),parent,'Return to the original Sandbox checkpoint');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('solar-friends-v3-sandbox')).village.mode),'sandbox');
 assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),storySave,'A Sandbox parent must never overwrite Story storage');
 result.modeIsolation=true;
 await writeFile(new URL('../artifacts/isometric/browser-performance.json',import.meta.url),JSON.stringify(result,null,2));

 if(await page.locator('#dev-dialog').evaluate(el=>el.open))await page.locator('#dev-close').click();
 await page.screenshot({path:new URL('../artifacts/isometric/performance-game.png',import.meta.url).pathname});
}finally{await writeFile(file,source);await writeFile(jsFile,jsSource);await browser.close();}
