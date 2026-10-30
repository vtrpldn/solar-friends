import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-checkpoint-fallback';await mkdir(output,{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin+'/editor.html');await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const fixtures=await page.evaluate(async()=>{
  const [{ContentLibrary},{EditorDocument},{Game}]=await Promise.all([import('/content-library.js'),import('/editor/document.js'),import('/pkg/solar_friends.js')]);
  const game=new Game(),library=new ContentLibrary(undefined,{broadcast:false}),records={};
  try{
   for(const kind of ['unsupported','incomplete','bad-cache']){
    const id='fallback-'+kind,d=JSON.parse(game.scenario_template('sandbox'));d.id=id;d.title='Earlier '+kind;
    const doc=new EditorDocument(d),first=await library.saveProject({id,checkpoint:doc.checkpoint(),view:{center:[28,30],zoom:1.65,grid:false}});
    doc.transact('Change current title',d=>{d.title='Current '+kind;if(kind==='incomplete'){d.start.residents=[];d.start.relationships=[];}});
    const checkpoint=doc.checkpoint();if(kind==='unsupported')checkpoint.definition.schema=999;
    records[kind]=await library.saveProject({id,checkpoint,view:{center:[32,32],zoom:1.3,grid:true}},first.revision);
    if(kind==='bad-cache'){const cached=structuredClone(checkpoint);cached.definition.schema=999;cached.definition.title='Unsupported cached draft';sessionStorage.setItem('solar-friends-project-recovery:'+id,JSON.stringify({storageRevision:records[kind].revision,checkpoint:cached,view:{center:[1,1],zoom:3}}));}
   }
   return records;
  }finally{library.close();game.free();}
 });
 for(const [kind,record]of Object.entries(fixtures)){
  await page.goto(origin+'/editor.html?project='+record.id);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
  await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false');
  // Let the actual terrain/thumbnail debounce run, then exercise the background
  // save path too. An immediate read missed the original overwrite race.
  await page.waitForTimeout(650);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
  const expected=(kind==='unsupported'?'Earlier ':'Current ')+kind;
  assert.equal(await page.locator('#creator-title').inputValue(),expected,kind+' chooses supported current or previous checkpoint');
  const durable=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(id);}finally{l.close();}},record.id);
  if(kind==='unsupported')assert.deepEqual(durable,record,'Opening must not rewrite the damaged original');
  else assert.deepEqual(durable.checkpoint,record.checkpoint,'Normal thumbnail refresh must preserve current authored content and history');
  if(kind==='unsupported'){
   assert.equal(await page.locator('#creator-grid').isChecked(),false);assert((await page.locator('#creator-save-status').textContent()).includes('Recovered'));
   await page.screenshot({path:output+'/previous-recovered.png'});
   await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
   const saved=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(id);}finally{l.close();}},record.id);
   assert.equal(saved.revision,record.revision+1);assert.equal(saved.checkpoint.definition.schema,1);assert.equal(saved.checkpoint.definition.title,expected);
  }
  if(kind==='incomplete')assert(await page.locator('#creator-test').isDisabled(),'Incomplete draft stays editable without reverting');
 }
 assert.deepEqual(errors,[]);const inputs={};for(const p of ['web/editor/index.js','web/editor/draft-checkpoint.js','web/editor/draft-import.js','web/editor/document.js','scripts/verify-editor-checkpoint-fallback.mjs'])inputs[p]=createHash('sha256').update(await readFile(p)).digest('hex');
 await writeFile(output+'/report.json',JSON.stringify({inputs,cases:Object.keys(fixtures),damagedOriginalUnchangedUntilExplicitSave:true,normalCurrentContentAndHistoryPreserved:true,browserErrors:errors,scope:'Public editor reload of a native-incompatible current checkpoint, intact incomplete current draft, and native-incompatible same-revision session recovery copy. Real terrain debounce and background save exercised; explicit Save acknowledges recovery. Previous valid view preserved. Does not simulate physical storage corruption or every crash phase.'},null,2)+'\n');
 console.log('PASS native-incompatible current draft falls back without rewriting originals; incomplete current drafts remain editable; incompatible session recovery cannot replace a supported durable checkpoint.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
