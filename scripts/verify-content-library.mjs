import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(0),base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext(),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>window.solarDev);
  const first=await page.evaluate(async()=>{
    const {ContentLibrary,LibraryConflict}=await import('/content-library.js');
    const {EditorDocument}=await import('/editor/document.js');
    const {Game}=await import('/pkg/solar_friends.js');
    const engine=new Game(),definition=JSON.parse(engine.scenario_template('sandbox'));engine.free();
    const name='solar-library-check-'+crypto.randomUUID(),a=new ContentLibrary(name),b=new ContentLibrary(name);
    const doc=new EditorDocument(definition),id=crypto.randomUUID();
    doc.transact('Name our property',d=>{d.title='A place to grow';});
    let saved=await a.saveProject({id,checkpoint:doc.checkpoint(),view:{center:[33,34],zoom:1.2,selected:'starting-shed',tool:'select'}});
    const heads=await b.listProjects();if(heads[0]?.title!=='A place to grow')throw Error('Missing project metadata');
    const competing=await b.getProject(id);
    doc.transact('Paint the path',d=>d.start.roads.push([28,31],[29,31]));
    saved=await a.saveProject({id,checkpoint:doc.checkpoint(),view:saved.view},saved.revision);
    let conflict=false;
    try{await b.saveProject({id,checkpoint:competing.checkpoint,view:competing.view},competing.revision);}catch(error){conflict=error instanceof LibraryConflict;}
    if(!conflict)throw Error('A stale tab overwrote the current project');
    let deleted=false;try{await b.deleteProject(id,competing.revision);}catch(error){deleted=error instanceof LibraryConflict;}
    if(!deleted)throw Error('A stale tab deleted the current project');
    const current=await b.getProject(id);
    if(current.checkpoint.definition.start.roads.length!==2||current.previous.checkpoint.definition.start.roads.length!==0)throw Error('The previous durable checkpoint was lost');
    sessionStorage.setItem('solar-library-check',JSON.stringify({name,id,revision:current.revision}));
    a.close();b.close();return {id,name};
  });
  await page.reload();await page.waitForFunction(()=>window.solarDev);
  const second=await page.evaluate(async()=>{
    const {ContentLibrary}=await import('/content-library.js');
    const {EditorDocument}=await import('/editor/document.js');
    const {PlayerSession}=await import('/player-session.js');
    const {Game}=await import('/pkg/solar_friends.js');
    const {name,id,revision}=JSON.parse(sessionStorage.getItem('solar-library-check')),library=new ContentLibrary(name);
    const saved=await library.getProject(id),doc=EditorDocument.restore(saved.checkpoint);
    if(saved.revision!==revision||doc.undoLabel!=='Paint the path'||saved.view.selected!=='starting-shed')throw Error('Project or undo history did not survive reload');
    const parent=JSON.stringify(saved.checkpoint),definition=doc.value,candidate=new Game();
    const result=JSON.parse(candidate.load_scenario(JSON.stringify(definition)));
    if(!result.ok)throw Error(JSON.stringify(result));
    const initial=candidate.snapshot();
    const run=await library.createRun({definition,snapshot:initial,projectId:id,sessionKind:'playtest',sourceRevision:saved.revision});candidate.free();
    const session=await PlayerSession.open(library,run.id,Game);
    for(let n=0;n<80;n++)session.game.tick(.25);
    await session.save();
    const lived=session.game.snapshot(),runId=run.id;
    session.dispose();
    const resumed=await PlayerSession.open(library,runId,Game);
    if(resumed.game.snapshot()!==lived)throw Error('The playtest checkpoint did not resume exactly');
    const edited=structuredClone(definition);edited.title='A different draft';
    await library.saveProject({id,checkpoint:{...doc.checkpoint(),definition:edited},view:saved.view},saved.revision);
    await resumed.restartTest();
    if(resumed.game.snapshot()!==initial)throw Error('Restart used the edited draft rather than frozen content');
    const unchanged=await library.getRun(runId);
    if(unchanged.definition.title!==definition.title)throw Error('A draft changed an existing run');
    await resumed.finishTest();resumed.dispose();
    if(await library.getRun(runId)!==null)throw Error('Finished scratch data was retained');
    const project=await library.getProject(id);
    if(project.checkpoint.definition.title!=='A different draft')throw Error('Playtest return changed the draft');
    const pristine=new Game();pristine.start_mode('story');
    localStorage.setItem('solar-friends-v3-story',pristine.snapshot());const story=pristine.snapshot();pristine.free();
    const game=new Game();game.load_scenario(JSON.stringify(definition));
    const normal=await library.createRun({definition,snapshot:game.snapshot(),projectId:id,sessionKind:'scenario'});game.free();
    const play=await PlayerSession.open(library,normal.id,Game);
    play.game.tick(.25);await play.save();
    if(localStorage.getItem('solar-friends-v3-story')!==story)throw Error('A custom run overwrote Story');
    await library.deleteProject(id,project.revision);
    const survivor=await library.getRun(normal.id);
    if(!survivor.definition||!survivor.snapshot)throw Error('Deleting a project removed its independent run');
    play.dispose();
    const duplicate=await library.saveRun(survivor.id,survivor.snapshot,survivor.revision);
    if(duplicate.previousSnapshot!==survivor.previousSnapshot)throw Error('A duplicate save displaced the earlier checkpoint');
    const broken=await library.saveRun(survivor.id,'invalid snapshot',duplicate.revision);
    if(broken.previousSnapshot!==survivor.snapshot)throw Error('Fixture did not retain a valid fallback');
    const fallback=await PlayerSession.open(library,survivor.id,Game);
    if(!fallback.recovered||fallback.game.snapshot()!==survivor.snapshot)throw Error('Failed to reopen the previous checkpoint');
    fallback.game.tick(.25);
    const firstRepair=await fallback.save();
    if(firstRepair.previousSnapshot!==survivor.snapshot)throw Error('Saving after fallback replaced a good recovery checkpoint with corrupt data');
    fallback.game.tick(.25);
    const resumedSave=await fallback.save();
    if(resumedSave.previousSnapshot!==firstRepair.snapshot)throw Error('A later save did not rotate to the repaired checkpoint');
    fallback.dispose();
    await library.deleteRun(survivor.id,resumedSave.revision);
    library.close();
    return {parentBytes:parent.length,runId,checks:9};
  });
  assert(first.id&&second.runId&&second.checks===9);assert.deepEqual(errors,[]);
  // Test the real Continue/Save checkpoint controls in the public library.
  const runId=await page.evaluate(async()=>{
    const [{ContentLibrary},{Game}]=await Promise.all([import('/content-library.js'),import('/pkg/solar_friends.js')]);
    const library=new ContentLibrary(),game=new Game();
    try{
      const definition=JSON.parse(game.scenario_template('sandbox'));
      if(!JSON.parse(game.load_scenario(JSON.stringify(definition))).ok)throw Error('Could not compile crash fixture');
      const run=await library.createRun({definition,snapshot:game.snapshot()});
      game.tick(.25);
      await library.saveRun(run.id,game.snapshot(),run.revision);
      return run.id;
    }finally{library.close();game.free();}
  });
  const readRun=()=>page.evaluate(async id=>{
    const {ContentLibrary}=await import('/content-library.js'),library=new ContentLibrary();
    try{
      return {record:await library.getRun(id),header:await library.getEntryDetails('run',id)};
    }finally{library.close();}
  },runId);
  const playing=await page.context().newPage();
  const sentinel='solar-test-village-unload';
  await playing.addInitScript(key=>window.addEventListener('beforeunload',()=>localStorage.setItem(key,'yes')),sentinel);
  await playing.goto(base+'/editor.html?library=1');
  await playing.locator(`[data-continue-run="${runId}"]`).click();
  await playing.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
  const pause=playing.locator('#pause');
  if((await pause.getAttribute('aria-label')).includes('Resume'))await pause.click();
  const initial=await readRun();
  const minute=JSON.parse(initial.record.snapshot).village.minutes;
  await playing.waitForFunction(minute=>window.solarDev.snapshot().village.minutes>minute,minute);
  if((await pause.getAttribute('aria-label')).includes('Pause'))await pause.click();
  const committed=await readRun();
  assert(committed.record.previousSnapshot);
  await playing.evaluate(({id,committedSnapshot})=>{
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...args){
      const request=put.call(this,value,...args);
      if(this.name==='runs'&&value.id===id&&value.snapshot!==committedSnapshot){
        request.addEventListener('success',()=>{
          const keepAlive=()=>{
            const next=this.get('__held_for_renderer_crash__');
            next.onsuccess=keepAlive;
          };
          keepAlive();
          void fetch('/?validation-run-write=held');
        });
      }
      return request;
    };
  },{id:runId,committedSnapshot:committed.record.snapshot});
  const held=playing.waitForRequest(request=>request.url().includes('validation-run-write=held'));
  await playing.getByRole('button',{name:'Save checkpoint',exact:true}).click();
  await held;
  assert(await playing.getByRole('button',{name:'Save checkpoint',exact:true}).isDisabled());
  // The deliberate navigation into the run already fired beforeunload.
  await page.evaluate(key=>localStorage.removeItem(key),sentinel);
  const cdp=await playing.context().newCDPSession(playing),crashed=playing.waitForEvent('crash');
  void cdp.send('Page.crash').catch(()=>{});
  await crashed;
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),sentinel),null);
  assert.deepEqual(await readRun(),committed,'A renderer crash committed a partial village checkpoint');
  const reopened=await page.context().newPage();
  await reopened.goto(base+'/editor.html?library=1');
  await reopened.locator(`[data-continue-run="${runId}"]`).click();
  await reopened.waitForFunction(()=>window.solarDev&&document.querySelector('.creation-session'));
  const start=await reopened.evaluate(async id=>{
    const [{ContentLibrary},{PlayerSession},{Game}]=await Promise.all([
      import('/content-library.js'),import('/player-session.js'),import('/pkg/solar_friends.js')
    ]);
    const library=new ContentLibrary(),session=await PlayerSession.open(library,id,Game);
    try{return session.game.snapshot();}finally{session.dispose();library.close();}
  },runId);
  assert.equal(start,committed.record.snapshot);
  console.log('PASS: actual IndexedDB persistence, history/view reload, atomic stale-tab save/delete rejection, recovery checkpoint, frozen playtest restart, exact run continuation, scratch cleanup, duplicate saves, fallback repair, renderer-crash rollback, and independent project/run/Story ownership.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
