import assert from 'node:assert/strict';import {chromium} from 'playwright';import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const result=await page.evaluate(async()=>{
  const {Game}=await import('/pkg/solar_friends.js'),{ContentLibrary}=await import('/content-library.js'),{loadEditorArt}=await import('/editor/map-view.js'),{ResidentPresetLibrary,residentFile}=await import('/editor/resident-presets.js');
  const engine=new Game(),art=await loadEditorArt(),library=new ContentLibrary('solar-portraits-'+crypto.randomUUID()),presets=JSON.parse(engine.scenario_catalog()).resident_presets,original=[];let controller;
  const check=(v,m)=>{if(!v)throw Error(m);};
  try{
   for(const person of presets){const file=residentFile(person);check(JSON.parse(engine.validate_resident_preset(JSON.stringify(file),true)).ok,'Valid bundled person');const record=await library.saveResidentPreset({id:person.id,file});original.push(record);}
   const unavailable=residentFile(presets[0]);unavailable.resident.appearance={preset:'iara',version:999};original.push(await library.saveResidentPreset({id:'future-look',file:unavailable}));
   const extra=residentFile(presets[0]);extra.resident.appearance={preset:'iara',version:1,unknownPart:'hair'};original.push(await library.saveResidentPreset({id:'future-part',file:extra}));
   const future=residentFile(presets[0]);future.compatibility.assets=999;original.push(await library.saveResidentPreset({id:'future-package',file:future}));
   const legacy={format:'solar-friends-resident',schema:1,resident:structuredClone(presets[0])};delete legacy.resident.id;original.push(await library.saveResidentPreset({id:'legacy-header',file:legacy}));
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(library.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('heads','readwrite'),store=tx.objectStore('heads'),r=store.get('resident:legacy-header');r.onsuccess=()=>{const h=r.result;delete h.residentAppearance;delete h.residentPackageSchema;store.put(h);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
   let bodyReads=0;const get=library.getResidentPreset.bind(library);library.getResidentPreset=(...args)=>{bodyReads++;return get(...args);};
   controller=new ResidentPresetLibrary({library,engine,art,presets,maximum:12,source:()=>({}),change:()=>{},notify:()=>{}});await controller.open();
   const canvases=[...controller.list.querySelectorAll('canvas')];check(canvases.length===6,'Five looks plus historical preset');check(bodyReads===1,'Only historical metadata should load a body');
   const signature=id=>controller.list.querySelector(`[data-preset-id="${id}"] canvas`)?.toDataURL();const looks=presets.map(p=>signature(p.id));check(new Set(looks).size===5,'Five distinct portraits');check(signature('legacy-header')===looks[0],'Legacy founder portrait mismatch');
   for(const id of ['future-look','future-part','future-package'])check(!signature(id),'Unsupported appearance silently substituted');
   for(const canvas of canvases){const pixels=canvas.getContext('2d').getImageData(0,0,64,76).data;check(pixels.some((v,i)=>i%4===3&&v>0),'Empty portrait');}
   for(const record of original)check(JSON.stringify(await get(record.id))===JSON.stringify(record),'Preview rewrote a preset');
   return {portraits:canvases.length,bodyReads,images:presets.map((p,i)=>({name:p.name,image:looks[i]}))};
  }finally{library.close();engine.free();}
 });assert.equal(result.portraits,6);assert.deepEqual(errors,[]);await page.screenshot({path:'/private/tmp/solar-resident-portraits.png',fullPage:true});await page.setContent('<body style="display:flex;gap:35px;background:#e8dfbc;padding:40px;font:18px Georgia">'+result.images.map(p=>`<figure style="margin:0;text-align:center"><img src="${p.image}" width="128" height="152"><figcaption>${p.name}</figcaption></figure>`).join('')+'</body>');await page.screenshot({path:'/private/tmp/solar-resident-portrait-sheet.png'});console.log('PASS: all five approved looks, default-look resolution, unchanged historical records, metadata-only modern previews, no substitutions for future artwork/parts/packages and nonempty portrait pixels.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
