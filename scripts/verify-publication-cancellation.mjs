import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-publication-cancellation';await mkdir(output,{recursive:true});const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const results=[];
 for(const kind of ['map','release']){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('[data-preset=camp]').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device');
  const ids=kind==='map'?{open:'creator-save-map',confirm:'creator-map-save-confirm',cancel:'creator-map-save-cancel',author:'creator-map-author',status:'creator-map-save-status'}:{open:'creator-release',confirm:'creator-release-confirm',cancel:'creator-release-cancel',author:'creator-release-author',status:'creator-release-status'};
  const counts=()=>page.evaluate(async()=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{return {maps:(await l.listMaps()).length,releases:(await l.listReleases()).length};}finally{l.close();}});
  await page.route('**/publication-validation-worker.js',async route=>{await new Promise(resolve=>setTimeout(resolve,1200));try{await route.continue();}catch{}});
  await page.locator('#'+ids.open).click();await page.locator('#'+ids.author).fill('Our community');
  for(const escape of [false,true]){
   await page.locator('#'+ids.confirm).click();await page.waitForFunction(ids=>!document.querySelector('.creator-prepare-dialog')&&!document.getElementById(ids.cancel).disabled&&document.getElementById(ids.confirm).disabled,ids);
   assert.equal(await page.locator('#'+ids.author).isDisabled(),true);assert.equal(await page.locator('#'+ids.cancel).textContent(),'Cancel save');if(!escape)await page.screenshot({path:output+'/'+kind+'-checking.png'});
   if(escape)await page.keyboard.press('Escape');else await page.locator('#'+ids.cancel).click();
   await page.waitForFunction(ids=>document.getElementById(ids.status).textContent.includes('publication cancelled'),ids);await page.waitForTimeout(1400);assert.deepEqual(await counts(),{maps:0,releases:0});assert.equal(await page.evaluate(()=>document.activeElement.id),ids.confirm);assert.equal(await page.locator('#'+ids.author).isEnabled(),true);
  }
  await page.unroute('**/publication-validation-worker.js');await page.locator('#'+ids.confirm).click();await page.locator('#creator-library-dialog').waitFor({state:'visible'});assert.deepEqual(await counts(),{maps:kind==='map'?1:0,releases:kind==='release'?1:0});
  const parity=await page.evaluate(async kind=>{
   const {ContentLibrary}=await import('/content-library.js'),{Game}=await import('/pkg/solar_friends.js'),{validatePublication}=await import('/editor/validate-publication.js'),l=new ContentLibrary(),g=new Game();
   try{const rows=await l[kind==='map'?'listMaps':'listReleases'](),record=await l[kind==='map'?'getMap':'getRelease'](rows[0].id),raw=JSON.stringify(record.package),native=data=>JSON.parse(kind==='map'?g.validate_map_package(data):g.validate_scenario(data));const valid=JSON.stringify(await validatePublication(kind,raw))===JSON.stringify(native(raw)),bad=structuredClone(record.package);bad.compatibility.assets=999;const invalid=JSON.stringify(await validatePublication(kind,JSON.stringify(bad)))===JSON.stringify(native(JSON.stringify(bad)));return {version:record.package.content_revision,valid,invalid};}finally{g.free();l.close();}
  },kind);assert.deepEqual(parity,{version:1,valid:true,invalid:true});assert.deepEqual(errors,[]);results.push({kind,cancelButton:true,escape:true,noLatePackage:true,focusRestored:true,nextVersion:1,workerNativeParity:parity,browserErrors:errors});await page.close();
 }
 await writeFile(output+'/report.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
