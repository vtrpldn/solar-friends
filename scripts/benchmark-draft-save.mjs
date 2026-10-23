import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-draft-save';await mkdir(output,{recursive:true});await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});const g=new Game(),template=JSON.parse(g.scenario_template('sandbox'));template.map=JSON.parse(g.generate_biome_property('mata-atlantica',42));const dense=mixedBuilderFixture(g,template);g.free();
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const cases=[];
 for(const fixture of [{definition:template,summary:{population:5,buildings:template.start.buildings.length}},dense]){
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.saveProbe=[];window.probeSave=false;const track=(object,key,label=key,when=()=>true)=>{const original=object[key];object[key]=function(...args){if(!window.probeSave||!when(this,args))return original.apply(this,args);const t=performance.now();try{return original.apply(this,args);}finally{window.saveProbe.push({key:label,ms:performance.now()-t});}};};window.saveProbeReady=Promise.all([import('/editor/document.js').then(({EditorDocument})=>{track(EditorDocument.prototype,'checkpoint');track(EditorDocument.prototype,'markSaved');}),import('/editor/map-view.js').then(({EditorMap})=>track(EditorMap.prototype,'render','thumbnailRender',self=>self.preview)),import('/content-library.js').then(({ContentLibrary})=>track(ContentLibrary.prototype,'saveProject','saveProjectSync')),Promise.resolve().then(()=>{track(Storage.prototype,'setItem','recoveryStore',(_self,args)=>args[0].startsWith('solar-friends-project-recovery:'));track(HTMLCanvasElement.prototype,'toDataURL','thumbnailEncode',(_self,args)=>args[0]==='image/webp');track(JSON,'stringify','recoveryEncode',(_self,args)=>args[0]?.checkpoint&&args[0]?.storageRevision!==undefined);})]);});
  await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.evaluate(()=>window.saveProbeReady);await page.locator('#creator-import').setInputFiles({name:'save-fixture.solar-scenario',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.definition))});await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent==='Saved on this device'&&document.querySelector('#creator-map').getAttribute('aria-busy')==='false');
  const samples=[];
  for(let i=0;i<3;i++){
   const sample=await page.evaluate(async i=>{const input=document.querySelector('#creator-funds');input.value=String(9000+i);input.dispatchEvent(new Event('change',{bubbles:true}));window.saveProbe=[];window.probeSave=true;const start=performance.now();document.querySelector('#creator-save').click();const synchronousMs=performance.now()-start;await new Promise(resolve=>{const check=()=>document.querySelector('#creator-save-status').textContent==='Saved on this device'?resolve():setTimeout(check,5);check();});const elapsedMs=performance.now()-start;window.probeSave=false;return {synchronousMs,elapsedMs,calls:window.saveProbe};},i);samples.push(sample);
  }
  assert.deepEqual(errors,[]);cases.push({fixture:fixture.summary,samples});await page.close();
 }
 const result={sourceHashes:Object.fromEntries(await Promise.all(['web/editor/index.js','web/editor/thumbnail.js','web/pkg/solar_friends_bg.wasm'].map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')]))),machine:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model},scope:'Three warm manual saves after a funds edit. Times include instrumented callbacks; not sustained save throughput or full memory evidence.',cases};await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
