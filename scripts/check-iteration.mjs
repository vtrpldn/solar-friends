import {chromium} from 'playwright';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const file=new URL('../src/lib.rs',import.meta.url),source=await readFile(file,'utf8');
try{
 await page.goto((process.env.DEV_URL||'http://127.0.0.1:4173')+'/?dev-scenario=autonomy&performance');await page.waitForFunction(()=>window.solarDevReloadReady);
 await page.locator('#dev-close').click();await page.evaluate(()=>window.solarDev.run());
 await page.waitForFunction(()=>window.solarPerformance.report().samples>=90,null,{timeout:60000});
 const perf=await page.evaluate(()=>window.solarPerformance.report());await page.locator('#pause').click();
 const before=await page.evaluate(()=>window.solarDev.snapshot());
 const started=Date.now();await writeFile(file,source+'\n// Live-rebuild checkpoint probe.\n');
 await page.waitForEvent('load',{timeout:60000});await page.waitForFunction(()=>window.solarDevReloadReady);
 const after=await page.evaluate(()=>window.solarDev.snapshot());
 const result={profile:'iteration',frame:perf,editToReadyMs:Date.now()-started,checkpoint:JSON.stringify(before)===JSON.stringify(after),browserErrors:errors};
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
 console.log(JSON.stringify(result,null,2));
 assert(result.checkpoint,'Exact paused checkpoint');assert.deepEqual(errors,[]);
 await page.locator('#dev-close').click();
 await page.screenshot({path:new URL('../artifacts/isometric/performance-game.png',import.meta.url).pathname});
}finally{await writeFile(file,source);await browser.close();}
