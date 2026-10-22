import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const result=await page.evaluate(async()=>{
  const {ContentLibrary}=await import('/content-library.js');
  const name='solar-v3-headers-'+crypto.randomUUID();
  const release={author:'João',content_revision:7,compatibility:{game:1,ruleset:1,assets:999}};
  const rows=['old','complete','invalid','playtest','missing'].map(id=>({key:`run:${id}`,kind:'run',id,title:id,revision:4,updatedAt:20,sessionKind:id==='playtest'?'playtest':'scenario',custom:{keep:true},...(id==='complete'?{author:'Original',contentRevision:2,compatibility:{game:1,ruleset:1,assets:1}}:{})}));
  const runs=rows.filter(h=>h.id!=='missing').map(h=>({id:h.id,format:'solar-friends-run',schema:1,revision:4,snapshot:'DO NOT REWRITE',previousSnapshot:'ORIGINAL',release:h.id==='invalid'?{author:'',content_revision:0,compatibility:{game:1,ruleset:1}}:release}));
  const old=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,3);r.onupgradeneeded=()=>{for(const s of ['projects','runs','residents','releases','releaseCounters','heads'])r.result.createObjectStore(s,{keyPath:s==='heads'?'key':'id'});r.transaction.objectStore('heads').createIndex('kind','kind');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=old.transaction(['runs','heads'],'readwrite');for(const row of rows)tx.objectStore('heads').put(row);for(const run of runs)tx.objectStore('runs').put(run);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});old.close();
  let library=new ContentLibrary(name);
  try{
   const heads=await library.listRuns();const migrated=heads.find(h=>h.id==='old');
   if(migrated.author!=='João'||migrated.contentRevision!==7||migrated.compatibility.assets!==999||!migrated.custom.keep||migrated.updatedAt!==20||migrated.revision!==4)throw Error('Metadata enrichment failed or changed identity');
   for(const row of rows.filter(h=>h.id!=='old'))if(JSON.stringify(heads.find(h=>h.id===row.id))!==JSON.stringify(row))throw Error('Unrelated header changed: '+row.id);
   for(const run of runs)if(JSON.stringify(await library.getRun(run.id))!==JSON.stringify(run))throw Error('Body rewritten');
   library.close();library=new ContentLibrary(name);if(JSON.stringify(await library.listRuns())!==JSON.stringify(heads))throw Error('Reopen changed migration');
   return true;
  }finally{library.close();indexedDB.deleteDatabase(name);}
 });assert(result);console.log('PASS: version-3 headers enriched without rewriting bodies, revisions, timestamps, complete metadata or unrelated rows; unsupported versions preserved; reopen stable.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
