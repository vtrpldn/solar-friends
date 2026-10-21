import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`,directory=await mkdtemp('/private/tmp/solar-sharing-');
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/editor.html');await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>!document.querySelector('#creator-test').disabled);
 const originalId=new URL(page.url()).searchParams.get('project');
 const downloadReady=page.waitForEvent('download');await page.locator('#creator-export').click();const download=await downloadReady;
 const file=directory+'/creation.solar-scenario';await download.saveAs(file);const exported=JSON.parse(await readFile(file,'utf8'));
 assert.equal(exported.map.terrain.length,4096);assert(exported.map.nature.length>100);assert.equal(exported.map.deposits.length,9);
 await page.locator('#creator-library').click();await page.locator('#creator-import').setInputFiles(file);
 await page.waitForFunction(id=>new URL(location.href).searchParams.get('project')!==id,originalId);
 const importedId=new URL(page.url()).searchParams.get('project');
 const records=await page.evaluate(async({originalId,importedId})=>{
  const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary();
  try{return {original:await library.getProject(originalId),imported:await library.getProject(importedId)};}finally{library.close();}
 },{originalId,importedId});
 assert.deepEqual(records.original.checkpoint.definition,exported);
 const imported=records.imported.checkpoint.definition;assert.notEqual(imported.id,exported.id);assert.notEqual(imported.map.id,exported.map.id);
 imported.id=exported.id;imported.map.id=exported.map.id;assert.deepEqual(imported,exported);
 await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
 assert.equal(await page.evaluate(()=>window.solarDev.snapshot().village.scenario.definition.map.terrain.length),4096);
 await page.getByRole('button',{name:'Return to editor',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 assert.equal(new URL(page.url()).searchParams.get('project'),importedId);
 assert.deepEqual(errors,[]);console.log('PASS real creation download → independent import → native playtest → editor return; resolved map contents and original project preserved.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
