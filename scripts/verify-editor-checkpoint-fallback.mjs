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
   for(const kind of ['unsupported','unsupported-keyboard','unsupported-conflict','incomplete','bad-cache']){
    const id='fallback-'+kind,d=JSON.parse(game.scenario_template('sandbox'));d.id=id;d.title='Earlier '+kind;
    const doc=new EditorDocument(d),first=await library.saveProject({id,checkpoint:doc.checkpoint(),view:{center:[28,30],zoom:1.65,grid:false}});
    doc.transact('Change current title',d=>{d.title='Current '+kind;if(kind==='incomplete'){d.start.residents=[];d.start.relationships=[];}});
    const checkpoint=doc.checkpoint();if(kind.startsWith('unsupported'))checkpoint.definition.schema=999;
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
  const expected=(kind.startsWith('unsupported')?'Earlier ':'Current ')+kind;
  assert.equal(await page.locator('#creator-title').inputValue(),expected,kind+' chooses supported current or previous checkpoint');
  const durable=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(id);}finally{l.close();}},record.id);
  if(kind.startsWith('unsupported'))assert.deepEqual(durable,record,'Opening must not rewrite the damaged original');
  else assert.deepEqual(durable.checkpoint,record.checkpoint,'Normal thumbnail refresh must preserve current authored content and history');
  if(kind.startsWith('unsupported')){
   assert.equal(await page.locator('#creator-grid').isChecked(),false);assert((await page.locator('#creator-save-status').textContent()).includes('Recovered'));
   await page.locator('#creator-library').click();await page.waitForFunction(()=>document.querySelector('#creator-library-dialog').open);
   const afterLibrary=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(id);}finally{l.close();}},record.id);
   assert.deepEqual(afterLibrary,record,'Opening Library to back up the damaged original must not overwrite it');
   await page.locator('.creator-library-recovery summary').click();
   await page.locator('#creator-backup-entry').selectOption(JSON.stringify(['project',record.id]));
   const downloading=page.waitForEvent('download');await page.locator('#creator-backup-record').click();const downloaded=await downloading;await downloaded.saveAs(output+'/original-damaged-backup.json');
   assert.deepEqual(JSON.parse(await readFile(output+'/original-damaged-backup.json','utf8')).record,JSON.parse(JSON.stringify(record)),'Backup retains exact damaged current and previous checkpoints');
   await page.locator('#creator-library-close').click();
   await page.locator('#creator-title').fill('Recovered edits kept separately');await page.locator('#creator-title').press('Tab');
   if(kind==='unsupported'){
    await page.evaluate(()=>{window.savedRecoverySetter=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(String(key).startsWith('solar-friends-project-recovery:'))throw new DOMException('Injected session recovery quota','QuotaExceededError');return window.savedRecoverySetter.call(this,key,value);};});
    await page.locator('#creator-library').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Could not save'));assert.equal(await page.locator('#creator-library-dialog').evaluate(d=>d.open),false,'Failed recovery preservation must stop navigation');assert.equal(await page.locator('#creator-title').inputValue(),'Recovered edits kept separately');
    await page.evaluate(()=>{Storage.prototype.setItem=window.savedRecoverySetter;delete window.savedRecoverySetter;});
   }
   await page.locator('#creator-library').click();await page.waitForFunction(()=>document.querySelector('#creator-library-dialog').open);
   const sessionCopy=await page.evaluate(id=>JSON.parse(sessionStorage.getItem('solar-friends-project-recovery:'+id)),record.id);assert.equal(sessionCopy.checkpoint.definition.title,'Recovered edits kept separately');
   await page.locator('#creator-library-close').click();await page.reload();await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false');
   assert.equal(await page.locator('#creator-title').inputValue(),'Recovered edits kept separately','Recovered edits survive a reload without replacing the damaged original');
   const afterReload=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(id);}finally{l.close();}},record.id);assert.deepEqual(afterReload,record);
   await page.screenshot({path:output+'/previous-recovered.png'});
   if(kind.endsWith('conflict')){
    const remote=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary();try{const old=await l.getProject(id);return await l.saveProject({id,checkpoint:old.checkpoint,view:old.view},old.revision);}finally{l.close();}},record.id);
    await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Changed in another tab'));
    await page.locator('#creator-library').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Changed in another tab'));assert.equal(await page.locator('#creator-library-dialog').evaluate(d=>d.open),false,'A conflicted recovery must not navigate away from its edits');
    await page.screenshot({path:output+'/conflicted-recovery.png'});await page.locator('#creator-recovery-copy').click();await page.waitForFunction(old=>new URL(location.href).searchParams.get('project')!==old,record.id);await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
    const copies=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return {original:await l.getProject(id),copy:await l.getProject(new URL(location.href).searchParams.get('project'))};}finally{l.close();}},record.id);
    assert.deepEqual(copies.original,remote);assert.equal(copies.copy.checkpoint.definition.title,'Recovered edits kept separately · copy');continue;
   }
   if(kind.endsWith('keyboard')){await page.locator('#creator-save-status').click();await page.keyboard.press('Control+s');}else await page.locator('#creator-save').click();await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));
   const saved=await page.evaluate(async id=>{const {ContentLibrary}=await import('/content-library.js'),l=new ContentLibrary(undefined,{broadcast:false});try{return await l.getProject(id);}finally{l.close();}},record.id);
   assert.equal(saved.revision,record.revision+1);assert.equal(saved.checkpoint.definition.schema,1);assert.equal(saved.checkpoint.definition.title,'Recovered edits kept separately');
  }
  if(kind==='incomplete')assert(await page.locator('#creator-test').isDisabled(),'Incomplete draft stays editable without reverting');
 }
 assert.deepEqual(errors,[]);const inputs={};for(const p of ['web/editor/index.js','web/editor.html','web/editor/style.css','web/editor/draft-checkpoint.js','web/editor/draft-import.js','web/editor/document.js','scripts/verify-editor-checkpoint-fallback.mjs'])inputs[p]=createHash('sha256').update(await readFile(p)).digest('hex');
 await writeFile(output+'/report.json',JSON.stringify({inputs,cases:Object.keys(fixtures),damagedOriginalUnchangedUntilExplicitSave:true,libraryNavigationPreservesOriginal:true,originalBackupDownloadedExactly:true,recoveredEditsKeptSeparatelyAcrossReload:true,recoveryQuotaStopsNavigation:true,explicitKeyboardSaveAcknowledgesRecovery:true,conflictedRecoveryStopsNavigation:true,conflictedRecoverySaveCopyPreservesBoth:true,normalCurrentContentAndHistoryPreserved:true,browserErrors:errors,scope:'Public editor reload of a native-incompatible current checkpoint, intact incomplete current draft, and native-incompatible same-revision session recovery copy. Real terrain debounce and background save exercised; explicit Save acknowledges recovery. Previous valid view preserved. Does not simulate physical storage corruption or every crash phase.'},null,2)+'\n');
 console.log('PASS native-incompatible current draft falls back without rewriting originals; incomplete current drafts remain editable; incompatible session recovery cannot replace a supported durable checkpoint.');
}catch(error){
 for(const context of browser?.contexts()??[])for(const page of context.pages()){
  console.error('Failure UI',await page.evaluate(()=>({url:location.href,ready:document.body.dataset.creatorReady,status:document.querySelector('#creator-save-status')?.textContent,mapBusy:document.querySelector('#creator-map')?.getAttribute('aria-busy'),toast:document.querySelector('#creator-toast')?.textContent})).catch(()=>null));
  await page.screenshot({path:output+'/failure.png'}).catch(()=>{});
 }
 throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
