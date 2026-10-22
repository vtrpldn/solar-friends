import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const fixtures=await page.evaluate(async()=>{
  const {ContentLibrary}=await import('/content-library.js'),{EditorDocument}=await import('/editor/document.js'),{freezeCreation}=await import('/editor/files.js'),{Game}=await import('/pkg/solar_friends.js');const l=new ContentLibrary(),g=new Game(),catalog=JSON.parse(g.scenario_catalog()),records=[];
  try{
   for(const biome of catalog.biomes){
    const d=JSON.parse(g.scenario_template('sandbox'));d.id=crypto.randomUUID();d.map={...JSON.parse(g.generate_biome_property(biome.id,27)),id:'map-'+d.id};d.rules.weather=biome.weather;d.title=biome.name+' historical';if(!JSON.parse(g.load_scenario(JSON.stringify(d))).ok)throw Error('Fixture cannot load');
    const definition=freezeCreation(d,{terrain:JSON.parse(g.terrain_template()),snapshot:JSON.parse(g.report_state()),catalog});
    const project=await l.saveProject({id:d.id,checkpoint:new EditorDocument(definition).checkpoint()});
    const release=await l.createRelease({projectId:project.id,expectedRevision:project.revision,author:'Original community',validate:raw=>JSON.parse(g.validate_scenario(raw))});
    const map=await l.createMap({projectId:project.id,expectedRevision:project.revision,author:'Original community',validate:raw=>JSON.parse(g.validate_map_package(raw))});
    const run=await l.createRun({definition,snapshot:g.snapshot()});
    records.push(...[['project',project],['release',release],['map',map],['run',run]].map(([kind,record])=>({kind,record})));
   }
   return records;
  }finally{l.close();g.free();}
 });
 await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 await page.waitForFunction(()=>document.querySelectorAll('.creator-preview img').length===12,{},{timeout:60000});
 await page.screenshot({path:'/private/tmp/solar-library-backfilled-previews.png'});
 const after=await page.evaluate(async fixtures=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(),get={project:'getProject',release:'getRelease',map:'getMap',run:'getRun'};try{return await Promise.all(fixtures.map(async({kind,record})=>({kind,record:await l[get[kind]](record.id),image:await l.getPreview(kind,record.id)})));}finally{l.close();}},fixtures);
 assert.deepEqual(after.map(({kind,record})=>({kind,record})),fixtures);assert(after.every(r=>r.image.startsWith('data:image/webp;base64,')));
 const guards=await page.evaluate(async({kind,record})=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{const image=await l.getPreview(kind,record.id);return {stale:await l.savePreviewIfCurrent(kind,record.id,record.revision-1,image),missing:await l.savePreviewIfCurrent(kind,'absent',1,image),invalid:await l.savePreviewIfCurrent(kind,record.id,record.revision,'javascript:bad'),unchanged:(await l.getPreview(kind,record.id))===image};}finally{l.close();}},fixtures[0]);
 assert.deepEqual(guards,{stale:false,missing:false,invalid:false,unchanged:true});
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.creator-preview img').length===12);assert.deepEqual(errors,[]);
 console.log('PASS: historical draft/release/map/run previews backfilled and durable in all three biomes; exact source records unchanged; stale/missing/invalid preview writes refused.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
