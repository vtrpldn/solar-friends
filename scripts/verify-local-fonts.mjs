import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const sources=JSON.parse(await readFile('web/fonts/sources.json'));
for(const [file,expected]of Object.entries(sources.sha256))assert.equal(createHash('sha256').update(await readFile('web/fonts/'+file)).digest('hex'),expected);
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),external=[],errors=[];
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();external.push(url.href);return route.abort();});page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/editor.html');await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const loaded=await page.evaluate(async()=>{await Promise.all([document.fonts.load('400 16px "DM Sans"'),document.fonts.load('600 24px Fraunces')]);return ['400 16px "DM Sans"','600 24px Fraunces'].every(font=>document.fonts.check(font));});assert(loaded);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);console.log('PASS: creator opens and both licensed bundled fonts load with external network blocked; source hashes match.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
