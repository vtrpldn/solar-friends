import {savePreparedProjectBytes} from './save-project-prepared.js';
import {MAX_VILLAGE_SNAPSHOT_CHARACTERS} from './recovery-limits.js';
import {createMapPackageAsync,validateMapPackage} from './map-package.js';
import {enrichRunHeaders} from './library-migrations.js';
import {canonical} from './editor/journal.js';
import {createReleasePackageAsync,validateRelease} from './release-package.js';
// Projects, frozen playthrough content, and their saves never share mode slots.
export class LibraryConflict extends Error {
  constructor(){super('Another tab changed this creation. Reload it or save your work as a copy.');this.name='LibraryConflict';}
}
// Reject promptly on cancellation even when a validator does not cooperate.
// Late validator completion is observed, but cannot enter the commit phase.
function whileActive(value,signal){
 if(!signal)return Promise.resolve(value);
 return new Promise((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason??new DOMException('Publication cancelled.','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(value).then(result=>{signal.removeEventListener('abort',abort);resolve(result);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  if(signal.aborted)abort();
 });
}
const clone=value=>structuredClone(value);
const recordKind=store=>({projects:'project',runs:'run',residents:'resident',releases:'release',maps:'map'})[store];
const header=(kind,record)=>({key:`${kind}:${record.id}`,kind,id:record.id,title:record.title,residentName:record.file?.resident?.name,residentAppearance:record.file?.resident?(record.file.resident.appearance??{preset:record.file.resident.preset,version:record.file.resident.preset_version}):undefined,residentPackageSchema:record.file?.schema,revision:record.revision,updatedAt:record.updatedAt,sessionKind:record.sessionKind,projectId:record.projectId,residentBalance:(record.definition??record.checkpoint?.definition??record.package?.definition)?.start?.resident_balance??'balanced',contentRevision:record.package?.content_revision??record.release?.content_revision??record.file?.content_revision,author:record.package?.author??record.release?.author??record.file?.author,compatibility:record.package?.compatibility??record.release?.compatibility??record.file?.compatibility});
const safeThumbnail=value=>typeof value==='string'&&value.length<=96*1024&&/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(value)?value:null;
const safeView=view=>clone(view||{center:[32,32],zoom:1.3,selected:null,tool:'select'});

function libraryTitle(name,label){
  const title=name.trim();
  if(!title||title.length>100)throw Error(`Enter a ${label} name between 1 and 100 characters.`);
  return title;
}

export class ContentLibrary extends EventTarget {
  #opening;
  #channel;
  constructor(name='solar-friends-creations',{broadcast=true}={}){
    super();this.name=name;
    if(broadcast&&typeof BroadcastChannel!=='undefined'){
      this.#channel=new BroadcastChannel(name);
      this.#channel.onmessage=event=>this.dispatchEvent(new CustomEvent('change',{detail:{...event.data,remote:true}}));
    }
  }
  async #db(){
    if(!this.#opening)this.#opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open(this.name,6);let blocked=false;
      request.onupgradeneeded=event=>{
        for(const name of ['projects','runs','residents','releases','releaseCounters','heads','previews','maps','mapCounters'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:['heads','previews'].includes(name)?'key':'id'});
        const heads=request.transaction.objectStore('heads');if(!heads.indexNames.contains('kind'))heads.createIndex('kind','kind',{unique:false});if(!heads.indexNames.contains('projectId'))heads.createIndex('projectId','projectId',{unique:false});
        if(event.oldVersion<4)enrichRunHeaders(request.transaction);
      };
      request.onblocked=()=>{blocked=true;reject(Error('Close other Solar Friends tabs to finish opening the creation library.'));};
      request.onerror=()=>{this.#opening=null;reject(request.error);};
      request.onsuccess=()=>{
        if(blocked){request.result.close();this.#opening=null;return;}
        const db=request.result;
        db.onversionchange=()=>{db.close();this.#opening=null;};
        resolve(db);
      };
    });
    return this.#opening;
  }
  async #read(store,key){
    const db=await this.#db();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readonly'),request=tx.objectStore(store).get(key);
      let value;request.onsuccess=()=>{value=request.result;};
      tx.oncomplete=()=>resolve(value??null);tx.onabort=()=>reject(tx.error||Error('Could not read the creation library.'));
    });
  }
  async #list(kind){
    const db=await this.#db();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('heads','readonly'),request=tx.objectStore('heads').index('kind').getAll(kind);
      let values=[];request.onsuccess=()=>{values=request.result;};
      tx.oncomplete=()=>resolve(values.sort((a,b)=>b.updatedAt-a.updatedAt));tx.onabort=()=>reject(tx.error);
    });
  }
  async #write(store,id,expected,update,thumbnail){
    const db=await this.#db();
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction([store,'heads','previews'],'readwrite'),records=tx.objectStore(store),request=records.get(id);
      let result,error;
      request.onsuccess=()=>{
        try{
          const previous=request.result;
          if((previous?.revision??null)!==expected)throw new LibraryConflict();
          result=update(previous);
          if(result){
            result.id=id;result.revision=(previous?.revision??0)+1;
            result.updatedAt=Math.max(Date.now(),(previous?.updatedAt??0)+1);
            records.put(result);tx.objectStore('heads').put(header(recordKind(store),result));
            if(thumbnail!==undefined){const key=`${recordKind(store)}:${id}`,image=safeThumbnail(thumbnail);if(image)tx.objectStore('previews').put({key,image});else tx.objectStore('previews').delete(key);}
          }else{
            records.delete(id);tx.objectStore('heads').delete(`${recordKind(store)}:${id}`);tx.objectStore('previews').delete(`${recordKind(store)}:${id}`);
          }
        }catch(cause){error=cause;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result??null);
      tx.onabort=()=>reject(error||tx.error||Error('Your creation could not be saved. Export a copy before closing.'));
    });
    this.#changed(store,id,result?.revision??null);
    return result;
  }
  #changed(kind,id,revision){const detail={kind,id,revision};this.#channel?.postMessage(detail);this.dispatchEvent(new CustomEvent('change',{detail}));}
  async rebuildIndex(){
    const db=await this.#db(),stores=['projects','runs','residents','releases','maps'];
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction([...stores,'heads'],'readwrite'),heads=tx.objectStore('heads');
      const result={scanned:0,repaired:0,skipped:0,missing:0};let error;
      for(const store of stores){
        const request=tx.objectStore(store).openCursor();
        request.onsuccess=()=>{
          const cursor=request.result;if(!cursor)return;result.scanned++;
          const record=cursor.value;
          if(typeof record?.id!=='string'||!record.id){result.skipped++;cursor.continue();return;}
          try{
            const kind=recordKind(store),next=header(kind,record);
            if(typeof next.title!=='string'||!next.title.trim())next.title='Untitled saved '+kind;
            const previous=heads.get(next.key);
            previous.onsuccess=()=>{
              if(JSON.stringify(previous.result)!==JSON.stringify(next)){heads.put(next);result.repaired++;}
              cursor.continue();
            };
          }catch(cause){error=cause;tx.abort();}
        };
      }
      // Keep orphaned metadata: it may identify an exported backup. Existence
      // checks use keys only, never load village snapshots a second time.
      const orphaned=heads.openCursor();
      orphaned.onsuccess=()=>{
        const cursor=orphaned.result;if(!cursor)return;const entry=cursor.value,store=stores.find(store=>recordKind(store)===entry.kind);
        if(!store||typeof entry.id!=='string'){cursor.continue();return;}
        const exists=tx.objectStore(store).getKey(entry.id);
        exists.onsuccess=()=>{if(exists.result===undefined){result.missing++;if(entry.missingBody!==true){cursor.update({...entry,missingBody:true});result.repaired++;}}cursor.continue();};
      };
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(error||tx.error||Error('The library index could not be repaired. Saved records are unchanged.'));
    });
    this.#changed('heads',null,null);return result;
  }
  async savePreviewIfCurrent(kind,id,revision,image){
    const store={project:'projects',run:'runs',release:'releases',map:'maps'}[kind],safe=safeThumbnail(image);
    if(!store||!safe)return false;const db=await this.#db();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction([store,'previews'],'readwrite'),request=tx.objectStore(store).get(id);let saved=false;
      request.onsuccess=()=>{if(!request.result||request.result.revision!==revision)return;tx.objectStore('previews').put({key:`${kind}:${id}`,image:safe});saved=true;};
      tx.oncomplete=()=>resolve(saved);tx.onabort=()=>reject(tx.error||Error('The preview could not be saved.'));
    });
  }
  async getPreview(kind,id){if(!['project','release','run','map'].includes(kind))return null;const row=await this.#read('previews',`${kind}:${id}`);return safeThumbnail(row?.image);}
  getEntryDetails(kind,id){if(!['project','run','resident','release','map'].includes(kind))throw Error('Unknown library collection.');return this.#read('heads',`${kind}:${id}`);}
  listMaps(){return this.#list('map');}
  getMap(id){return this.#read('maps',id);}
  renameMap(id,expectedRevision,name){
    const title=libraryTitle(name,'map');
    return this.#write('maps',id,expectedRevision,record=>{
      if(!record)throw new LibraryConflict();
      return {...record,title};
    });
  }
  async copyMap(id,expectedRevision,name){
    const title=libraryTitle(name,'map');
    const record=await this.getMap(id);
    if(!record||record.revision!==expectedRevision)throw new LibraryConflict();
    const thumbnail=await this.getPreview('map',id);
    // Copy the selected frozen snapshot with its publication and source credits.
    return this.#write('maps',crypto.randomUUID(),null,()=>({...record,title}),thumbnail);
  }
  deleteMap(id,expectedRevision){return this.#write('maps',id,expectedRevision,()=>null);}
  async importMap(file,validate,thumbnail){const data=validateMapPackage(file,validate);return this.#write('maps',crypto.randomUUID(),null,()=>({format:'solar-friends-frozen-map',schema:1,title:data.title,projectId:null,sourceRevision:null,package:data}),thumbnail);}
  listReleases(){return this.#list('release');}
  getRelease(id){return this.#read('releases',id);}
  deleteRelease(id,expectedRevision){return this.#write('releases',id,expectedRevision,()=>null);}
  listProjects(){return this.#list('project');}
  listRuns(){return this.#list('run');}
  listResidentPresets(){return this.#list('resident');}
  getResidentPreset(id){return this.#read('residents',id);}
  getProject(id){return this.#read('projects',id);}
  getRun(id){return this.#read('runs',id);}
  // For detached editor checkpoints only. Returns compact durable metadata;
  // callers retain the captured checkpoint used to acknowledge the saved edit.
  async savePreparedProject(input,expectedRevision=null,options){
    const id=input?.id,raw=JSON.stringify(input),receipt=crypto.randomUUID();
    let saved;
    try{saved=await savePreparedProjectBytes(this.name,raw,expectedRevision,{...options,receipt});if(saved.id!==id)throw Error('The saved creation acknowledgement names a different draft.');}
    catch(error){
      if(error.name==='LibraryConflict')throw new LibraryConflict();
      // A transaction may commit before its worker's reply is lost. Read back
      // only on failure; a receipt is atomically stored with that exact commit.
      // Never retry the write or mistake another tab's newer record for ours.
      let durable;try{durable=await this.#read('projects',id);}catch{throw error;}
      if(durable?.revision===(expectedRevision??0)+1&&durable.saveReceipt===receipt){
        const {id,revision,updatedAt,title,attribution,saveReceipt}=durable;saved={id,revision,updatedAt,title,attribution,saveReceipt};
      }else if((durable?.revision??null)!==expectedRevision)throw new LibraryConflict();
      else throw error;
    }
    this.#changed('projects',saved.id,saved.revision);return saved;
  }
  async saveProject({id,checkpoint,view,attribution,thumbnail},expectedRevision=null,{receipt}={}){
    if(checkpoint?.schema!==1||!Number.isSafeInteger(checkpoint.revision)||!checkpoint.definition?.start)throw Error('This draft checkpoint is not supported.');
    if(receipt!==undefined&&(typeof receipt!=='string'||!receipt.length||receipt.length>96))throw Error('This save receipt is invalid.');
    const data=clone({checkpoint,view:safeView(view)});
    return this.#write('projects',id,expectedRevision,previous=>{
      const credits=clone(attribution??previous?.attribution??[]);
      let sameDraft=false;
      if(previous?.checkpoint?.revision===checkpoint.revision){
        try{
          sameDraft=canonical(previous.checkpoint.definition)===canonical(checkpoint.definition)
            &&canonical(previous.attribution??[])===canonical(credits);
        }catch{/* An unreadable prior record must remain recoverable as original data. */}
      }
      // A view or thumbnail save must not displace the last distinct draft.
      const recovery=previous&&!sameDraft
        ?{checkpoint:{...previous.checkpoint,history:undefined},view:previous.view,attribution:previous.attribution??[]}
        :previous?.previous??null;
      return {
        format:'solar-friends-project',schema:1,...data,
        title:checkpoint.definition.title,attribution:credits,
        ...(receipt===undefined?{}:{saveReceipt:receipt}),
        previous:recovery
      };
    },thumbnail);
  }
  deleteProject(id,expectedRevision){return this.#write('projects',id,expectedRevision,()=>null);}
  createRelease({projectId,expectedRevision,author,validate,thumbnail,signal}){
    return this.#freeze({projectId,expectedRevision,thumbnail,signal},{store:'releases',counters:'releaseCounters',kind:'release',format:'solar-friends-frozen-release',makePackage:(id,version,source)=>createReleasePackageAsync({id,version,definition:source.checkpoint.definition,author,credits:source.attribution??[],validate})});
  }
  createMap({projectId,expectedRevision,author,validate,thumbnail,title,description,signal}){
    return this.#freeze({projectId,expectedRevision,thumbnail,signal},{store:'maps',counters:'mapCounters',kind:'map',format:'solar-friends-frozen-map',makePackage:(id,version,source)=>{const d=source.checkpoint.definition;return createMapPackageAsync({id,version,map:d.map,weather:d.rules.weather,title:title??d.title,description:description??d.description,author,credits:source.attribution??[],validate});}});
  }
  async #freeze({projectId,expectedRevision,thumbnail,signal},{store,counters,kind,format,makePackage}){
    signal?.throwIfAborted();const db=await this.#db(),id=crypto.randomUUID();
    // Validation may await a worker. Never keep an IndexedDB transaction open
    // across that await; recheck both the source and version counter at commit.
    for(let attempt=0;attempt<8;attempt++){
      signal?.throwIfAborted();
      const previous=await this.#read('projects',projectId);
      if(!previous||previous.revision!==expectedRevision)throw new LibraryConflict();
      const count=(await this.#read(counters,projectId))?.version??0,version=count+1;
      signal?.throwIfAborted();
      const sourceIdentity=canonical({definition:previous.checkpoint.definition,attribution:previous.attribution??[]});
      const file=await whileActive(makePackage(id,version,previous),signal);
      signal?.throwIfAborted();
      const result=await new Promise((resolve,reject)=>{
        const tx=db.transaction(['projects',store,counters,'heads','previews'],'readwrite');let result,error,retry=false;
        const abort=()=>{error=signal.reason??new DOMException('Publication cancelled.','AbortError');try{tx.abort();}catch{/* Completion owns an already committed record. */}};
        signal?.addEventListener('abort',abort,{once:true});
        const finish=()=>signal?.removeEventListener('abort',abort);
        const source=tx.objectStore('projects').get(projectId);
        source.onsuccess=()=>{try{
          if(!source.result||source.result.revision!==expectedRevision||canonical({definition:source.result.checkpoint?.definition,attribution:source.result.attribution??[]})!==sourceIdentity){error=new LibraryConflict();tx.abort();return;}
          const versions=tx.objectStore(counters).get(projectId);
          versions.onsuccess=()=>{try{
            if((versions.result?.version??0)!==count){retry=true;tx.abort();return;}
            result={id,revision:1,updatedAt:Date.now(),format,schema:1,title:file.title,projectId,sourceRevision:previous.revision,package:file};
            tx.objectStore(store).add(result);tx.objectStore('heads').add(header(kind,result));
            if(safeThumbnail(thumbnail))tx.objectStore('previews').put({key:`${kind}:${id}`,image:thumbnail});
            tx.objectStore(counters).put({id:projectId,version});
          }catch(cause){error=cause;tx.abort();}};
        }catch(cause){error=cause;tx.abort();}};
        tx.oncomplete=()=>{finish();resolve(result);};
        tx.onabort=()=>{finish();if(error)reject(error);else if(retry)resolve(null);else reject(tx.error||Error('The content package could not be saved. Your draft is unchanged.'));};
        if(signal?.aborted)abort();
      });
      if(result){this.#changed(store,id,1);return result;}
    }
    throw new LibraryConflict();
  }
  async importRelease(file,validate,thumbnail){
    const data=validateRelease(file,validate);
    return this.#write('releases',crypto.randomUUID(),null,()=>({format:'solar-friends-frozen-release',schema:1,title:data.title,projectId:null,sourceRevision:null,package:data}),thumbnail);
  }
  async createRun({definition,snapshot,projectId=null,sessionKind='scenario',sourceRevision=null,releaseId=null,thumbnail,attribution}){
    if(!['scenario','playtest'].includes(sessionKind)||typeof snapshot!=='string'||snapshot.length>MAX_VILLAGE_SNAPSHOT_CHARACTERS)throw Error('This playthrough cannot be stored.');
    let release=null;
    if(releaseId){
      const record=await this.getRelease(releaseId);
      if(!record||canonical(record.package.definition)!==canonical(definition)||sessionKind!=='scenario')throw Error('Choose the exact frozen release before starting this village.');
      const p=record.package;release={id:record.id,packageId:p.id,content_revision:p.content_revision,author:p.author,compatibility:clone(p.compatibility),credits:clone(p.credits??[])};
    }
    const data=clone({definition,snapshot,projectId,sessionKind,sourceRevision,...(release?{release}:{}),...(attribution?{attribution}:{})});
    return this.#write('runs',crypto.randomUUID(),null,()=>({format:'solar-friends-run',schema:1,title:definition.title,...data}),thumbnail);
  }
  async importRecoveredRun({definition,snapshot,release=null,attribution,title=definition?.title}){
    if(typeof snapshot!=='string'||snapshot.length>MAX_VILLAGE_SNAPSHOT_CHARACTERS||!definition?.start)throw Error('This recovered village cannot be stored.');
    const data=clone({definition,snapshot,release,...(attribution?{attribution}:{})});
    return this.#write('runs',crypto.randomUUID(),null,()=>({format:'solar-friends-run',schema:1,title:typeof title==='string'?title.slice(0,100):definition.title,projectId:null,sessionKind:'scenario',sourceRevision:null,...data}));
  }
  renameRun(id,expectedRevision,name){
    const title=libraryTitle(name,'village');
    return this.#write('runs',id,expectedRevision,record=>{
      if(!record||record.sessionKind!=='scenario')throw new LibraryConflict();
      return {...record,title};
    });
  }
  saveRun(id,snapshot,expectedRevision){
    if(typeof snapshot!=='string'||snapshot.length>MAX_VILLAGE_SNAPSHOT_CHARACTERS)throw Error('This playthrough is too large to save.');
    return this.#write('runs',id,expectedRevision,previous=>{
      if(!previous)throw Error('This playthrough is missing.');
      // Definition and source revision are immutable throughout this run.
      return {...previous,previousSnapshot:previous.snapshot,snapshot};
    });
  }
  deleteRun(id,expectedRevision){return this.#write('runs',id,expectedRevision,()=>null);}
  close(){this.#channel?.close();this.#opening?.then(db=>db.close());this.#opening=null;}
}
