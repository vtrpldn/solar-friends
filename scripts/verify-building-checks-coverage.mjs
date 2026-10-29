import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {allBuildingArt} from '../web/building-art.js';
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/checks.html`);await page.waitForFunction(()=>!document.querySelector('#export').disabled,{},{timeout:120000});
 const records=await page.locator('#houses figure').evaluateAll(figures=>figures.map(f=>({key:f.dataset.building,state:f.dataset.lighting,width:f.querySelector('canvas').width,height:f.querySelector('canvas').height,caption:f.textContent})));
 const expected=Object.keys(allBuildingArt).flatMap(key=>['day','powered-night','unpowered-night'].map(state=>`${key}:${state}`));
 assert.deepEqual(records.map(r=>`${r.key}:${r.state}`).sort(),expected.sort());assert(records.every(r=>r.width===640&&r.height===480));assert.deepEqual(errors,[]);
 await mkdir('artifacts/building-checks-coverage',{recursive:true});
 for(const [key,state]of [['adobe-gable','day'],['workshop','powered-night'],['shed','unpowered-night']])await page.locator(`#houses figure[data-building="${key}"][data-lighting="${state}"]`).screenshot({path:`artifacts/building-checks-coverage/${key}-${state}.png`});
 console.log(`PASS ${records.length} shared-renderer building/state previews cover all ${Object.keys(allBuildingArt).length} current building keys; visual art acceptance remains separate.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
