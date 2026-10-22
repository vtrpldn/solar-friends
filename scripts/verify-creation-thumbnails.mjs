import assert from 'node:assert/strict';import {chromium} from 'playwright';import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.solarDev);
 const result=await page.evaluate(async()=>{
  const {Game}=await import('/pkg/solar_friends.js'),{loadEditorArt}=await import('/editor/map-view.js'),{creationThumbnail}=await import('/editor/thumbnail.js'),{ContentLibrary}=await import('/content-library.js'),{EditorDocument}=await import('/editor/document.js');
  const game=new Game(),art=await loadEditorArt(),library=new ContentLibrary('solar-preview-'+crypto.randomUUID()),images=[];const assert=(v,m)=>{if(!v)throw Error(m);};
  try{
   for(const biome of JSON.parse(game.scenario_catalog()).biomes){
    const d=JSON.parse(game.scenario_template('sandbox'));d.map={...JSON.parse(game.generate_biome_property(biome.id,27)),id:d.map.id};assert(JSON.parse(game.load_scenario(JSON.stringify(d))).ok,'Compile '+biome.id);
    const snapshot=JSON.parse(game.report_state()),before=game.snapshot(),definition=JSON.stringify(d),thumbnail=creationThumbnail(d,snapshot,art);assert(thumbnail.length<96*1024,'Bounded preview');assert(thumbnail===creationThumbnail(d,snapshot,art),'Deterministic preview');assert(before===game.snapshot()&&definition===JSON.stringify(d),'Renderer changed content');
    const img=new Image();img.src=thumbnail;await img.decode();assert(img.naturalWidth===480&&img.naturalHeight===300,'Preview dimensions');images.push(thumbnail);
    const id=crypto.randomUUID(),checkpoint=new EditorDocument(d).checkpoint();let record=await library.saveProject({id,checkpoint,thumbnail});assert(await library.getPreview('project',id)===thumbnail,'Preview persisted');assert(!('thumbnail'in record)&&!('thumbnail'in(await library.listProjects()).find(p=>p.id===id)),'Separate image storage');
    record=await library.saveProject({id,checkpoint},record.revision);assert(await library.getPreview('project',id)===thumbnail,'Ordinary save lost preview');
    try{await library.saveProject({id,checkpoint,thumbnail:null},1);throw Error('Stale save accepted');}catch(e){assert(e.name==='LibraryConflict','Expected conflict');}assert(await library.getPreview('project',id)===thumbnail,'Failed save changed preview');
    await library.deleteProject(id,record.revision);assert(await library.getPreview('project',id)===null,'Deleted preview leaked');
    const malformed=await library.saveProject({id:crypto.randomUUID(),checkpoint,thumbnail:'https://example.com/remote.png'});assert(await library.getPreview('project',malformed.id)===null,'Remote image accepted');
   }
   assert(new Set(images).size===3,'Biomes must look different');return {biomes:images.length,images};
  }finally{library.close();game.free();}
 });assert.equal(result.biomes,3);await page.setContent('<body style="background:#e9dfbd;display:flex;gap:20px;padding:20px">'+result.images.map(src=>`<img src="${src}" style="width:360px;height:225px">`).join('')+'</body>');await page.screenshot({path:'/private/tmp/solar-biome-thumbnails.png'});console.log('PASS: distinct deterministic painted previews for all three biomes; no source mutation; bounded local images in separate storage; stale-write atomicity, save preservation and deletion cleanup.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
