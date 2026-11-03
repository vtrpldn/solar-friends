import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {closeValidationBrowser} from './close-validation-browser.mjs';
const output=process.argv[2]??'artifacts/browser-cadence';await mkdir(output,{recursive:true});
const server=await serve(0,{handle(_req,res,path){if(path==='/cadence-probe'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Disposable cadence probe</title><p>Empty page frame timing probe.</p>');return true;}return false;}});let browser;
try{
 browser=await chromium.launch({headless:false});const session=await browser.newBrowserCDPSession(),gpu=(await session.send('SystemInfo.getInfo')).gpu;await session.detach();const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(`http://127.0.0.1:${server.address().port}/cadence-probe`);await page.bringToFront();
 const sample=await page.evaluate(async()=>{const gaps=[],start=performance.now();let previous=start;await new Promise(resolve=>{const frame=now=>{gaps.push(now-previous);previous=now;if(now-start<10000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});gaps.sort((a,b)=>a-b);return{wallSeconds:(previous-start)/1000,frames:gaps.length,medianGapMs:gaps[Math.floor(gaps.length*.5)],p95GapMs:gaps[Math.floor(gaps.length*.95)],maxGapMs:gaps.at(-1),visibility:document.visibilityState,focused:document.hasFocus(),devicePixelRatio};});assert(sample.frames>0);
 await writeFile(output+'/report.json',JSON.stringify({completed:true,scriptSha256:createHash('sha256').update(await readFile('scripts/probe-browser-cadence.mjs')).digest('hex'),browser:browser.version(),gpu,sample,scope:'Visible Chromium empty-page requestAnimationFrame cadence, same viewport as gameplay benchmark. No game code or simulation. This cannot identify operating-system/display/window-manager scheduling causes or prove physical display smoothness.'},null,2)+'\n');console.log(JSON.stringify(sample));
}finally{await closeValidationBrowser(browser,server);}
