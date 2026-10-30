import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-save-ack-recovery';await mkdir(output,{recursive:true});const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {ContentLibrary,LibraryConflict}=await import('/content-library.js'),rows=[];
  for(const fault of ['error','messageerror','invalid','timeout','new-draft','other-writer','lookalike-writer','no-commit']){
   const name='ack-recovery-'+crypto.randomUUID(),library=new ContentLibrary(name,{broadcast:false}),other=new ContentLibrary(name,{broadcast:false}),changes=[];library.addEventListener('change',e=>changes.push(e.detail));
   const checkpoint=title=>({schema:1,revision:1,definition:{title,start:{funds:42}},history:{format:2,past:[],future:[]}}),initial={id:'draft',checkpoint:checkpoint('Before save'),view:{center:[32,32],zoom:1.3}},next={id:'draft',checkpoint:checkpoint('After save'),view:{center:[30,34],zoom:1.5}};let terminated=0,committed;
   try{
    const expected=fault==='new-draft'?null:1,target=(expected??0)+1;if(expected!==null)await library.saveProject(initial);changes.length=0;
    const workerFactory=()=>{
     if(fault==='no-commit'||fault==='lookalike-writer'){const wrapper={terminate(){terminated++;},postMessage(){queueMicrotask(async()=>{if(fault==='lookalike-writer')await other.saveProject(next,1);wrapper.onmessage?.({data:{error:'No matching receipt'}});});}};return wrapper;}
     const actual=new Worker('/project-save-worker.js',{type:'module'}),wrapper={terminate(){terminated++;actual.terminate();},postMessage(data){actual.postMessage(data);}};
     actual.onerror=e=>wrapper.onerror?.(e);actual.onmessageerror=e=>wrapper.onmessageerror?.(e);
     actual.onmessage=async e=>{
      if(!e.data.saved){wrapper.onmessage?.(e);return;}
      committed=await other.getProject('draft');
      if(fault==='other-writer')await other.saveProject({...next,checkpoint:checkpoint('Other writer')},committed.revision);
      if(fault==='timeout')return;
      if(fault==='messageerror')wrapper.onmessageerror?.({});
      else wrapper.onmessage?.({data:fault==='invalid'?{saved:{...e.data.saved,id:'wrong-draft'}}:{error:'Simulated lost acknowledgement'}});
     };return wrapper;
    };
    let ack,error;try{ack=await library.savePreparedProject(next,expected,{workerFactory,timeoutMs:1000});}catch(e){error=e;}
    const durable=await other.getProject('draft');
    if(fault==='no-commit'){if(!error||error instanceof LibraryConflict||durable.revision!==1||changes.length!==0)throw Error('Uncommitted failure was incorrectly acknowledged');}
    else if(fault==='other-writer'||fault==='lookalike-writer'){
     if(!(error instanceof LibraryConflict))throw Error('A newer different commit must remain a conflict');
     if(durable.checkpoint.definition.title!==(fault==='other-writer'?'Other writer':'After save')||durable.revision!==(fault==='other-writer'?3:2)||changes.length!==0)throw Error('Conflicting write was acknowledged or replaced');
    }else{
     if(error)throw error;
     if(ack.revision!==target||ack.id!=='draft'||'checkpoint'in ack)throw Error('Recovery must return compact durable acknowledgement');
     if(JSON.stringify(durable)!==JSON.stringify(committed)||durable.revision!==target||durable.checkpoint.definition.title!=='After save')throw Error('Reconciliation rewrote the record');
     if(changes.length!==1||changes[0].revision!==target)throw Error('Reconciled commit must notify exactly once');
     const following=await library.savePreparedProject({...next,checkpoint:checkpoint('Following save')},ack.revision);if(following.revision!==target+1)throw Error('Following save conflicted after acknowledgement recovery');
    }
    if(terminated!==1)throw Error('Failed transport worker was not disposed');
    rows.push({fault,reconciled:!['other-writer','lookalike-writer','no-commit'].includes(fault),conflictPreserved:['other-writer','lookalike-writer'].includes(fault),terminated,durableRevision:durable.revision,previousTitle:durable.previous?.checkpoint.definition.title??null});
   }finally{library.close();other.close();}
  }
  return rows;
 });
 assert.deepEqual(errors,[]);await writeFile(output+'/report.json',JSON.stringify({rows:result,browserErrors:errors},null,2)+'\n');console.log('PASS real durable saves with lost/invalid/unreadable acknowledgements, no duplicate commits, following saves, single notifications and newer-writer conflict isolation.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
