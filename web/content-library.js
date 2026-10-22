import {createMapPackage,validateMapPackage} from './map-package.js';
import {enrichRunHeaders} from './library-migrations.js';
import {canonical} from './editor/journal.js';
import {createReleasePackage,validateRelease} from './release-package.js';
// Projects, frozen playthrough content, and their saves never share mode slots.
export class LibraryConflict extends Error {
  constructor(){super('Another tab changed this creation. Reload it or save your work as a copy.');this.name='LibraryConflict';}
}
const clone=value=>structuredClone(value);
const recordKind=store=>({projects:'project',runs:'run',residents:'resident',releases:'release',maps:'map'})[store];
const header=(kind,record)=>({key:`${kind}:${record.id}`,kind,id:record.id,title:record.title,residentName:record.file?.resident?.name,residentAppearance:record.file?.resident?(record.file.resident.appearance??{preset:record.file.resident.preset,version:record.file.resident.preset_version}):undefined,residentPackageSchema:record.file?.schema,revision:record.revision,updatedAt:record.updatedAt,sessionKind:record.sessionKind,projectId:record.projectId,residentBalance:(record.definition??record.checkpoint?.definition??record.package?.definition)?.start?.resident_balance??'balanced',contentRevision:record.package?.content_revision??record.release?.content_revision??record.file?.content_revision,author:record.package?.author??record.release?.author??record.file?.author,compatibility:record.package?.compatibility??record.release?.compatibility??record.file?.compatibility});
const safeThumbnail=value=>typeof value==='string'&&value.length<=96*1024&&/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(value)?value:null;
const safeView=view=>clone(view||{center:[32,32],zoom:1.3,selected:null,tool:'select'});

export class ContentLibrary extends EventTarget {
  #opening;
  #channel;
  constructor(name='solar-friends-creations'){
    super();this.name=name;
    if(typeof BroadcastChannel!=='undefined'){
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
  deleteMap(id,expectedRevision){return this.#write('maps',id,expectedRevision,()=>null);}
  async importMap(file,validate,thumbnail){const data=validateMapPackage(file,validate);return this.#write('maps',crypto.randomUUID(),null,()=>({format:'solar-friends-frozen-map',schema:1,title:data.title,projectId:null,sourceRevision:null,package:data}),thumbnail);}
  listReleases(){return this.#list('release');}
  getRelease(id){return this.#read('releases',id);}
  deleteRelease(id,expectedRevision){return this.#write('releases',id,expectedRevision,()=>null);}
  listProjects(){return this.#list('project');}
  listRuns(){return this.#list('run');}
  listResidentPresets(){return this.#list('resident');}
  getResidentPreset(id){return this.#read('residents',id);}
  saveResidentPreset({id,file},expectedRevision=null){
    if(file?.format!=='solar-friends-resident'||![1,2].includes(file.schema)||typeof file.resident?.name!=='string'||'id' in file.resident||new TextEncoder().encode(JSON.stringify(file)).length>64*1024)throw Error('This resident preset cannot be stored.');
    const data=clone(file);
    return this.#write('residents',id,expectedRevision,()=>({format:'solar-friends-resident-preset',schema:1,title:data.title??data.resident.name,file:data}));
  }
  deleteResidentPreset(id,expectedRevision){return this.#write('residents',id,expectedRevision,()=>null);}
  getProject(id){return this.#read('projects',id);}
  getRun(id){return this.#read('runs',id);}
  async saveProject({id,checkpoint,view,attribution,thumbnail},expectedRevision=null){
    if(checkpoint?.schema!==1||!Number.isSafeInteger(checkpoint.revision)||!checkpoint.definition?.start)throw Error('This draft checkpoint is not supported.');
    const data=clone({checkpoint,view:safeView(view)});
    return this.#write('projects',id,expectedRevision,previous=>({
      format:'solar-friends-project',schema:1,...data,
      title:checkpoint.definition.title,attribution:clone(attribution??previous?.attribution??[]),
      previous:previous?{checkpoint:{...previous.checkpoint,history:undefined},view:previous.view}:null,
    }),thumbnail);
  }
  deleteProject(id,expectedRevision){return this.#write('projects',id,expectedRevision,()=>null);}
  createRelease({projectId,expectedRevision,author,validate,thumbnail}){
    return this.#freeze({projectId,expectedRevision,thumbnail},{store:'releases',counters:'releaseCounters',kind:'release',format:'solar-friends-frozen-release',makePackage:(id,version,source)=>createReleasePackage({id,version,definition:source.checkpoint.definition,author,credits:source.attribution??[],validate})});
  }
  createMap({projectId,expectedRevision,author,validate,thumbnail,title,description}){
    return this.#freeze({projectId,expectedRevision,thumbnail},{store:'maps',counters:'mapCounters',kind:'map',format:'solar-friends-frozen-map',makePackage:(id,version,source)=>{const d=source.checkpoint.definition;return createMapPackage({id,version,map:d.map,weather:d.rules.weather,title:title??d.title,description:description??d.description,author,credits:source.attribution??[],validate});}});
  }
  async #freeze({projectId,expectedRevision,thumbnail},{store,counters,kind,format,makePackage}){
    const db=await this.#db(),id=crypto.randomUUID();
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction(['projects',store,counters,'heads','previews'],'readwrite'),projects=tx.objectStore('projects'),heads=tx.objectStore('heads');let result,error;
      const source=projects.get(projectId);
      source.onsuccess=()=>{
        const previous=source.result;
        if(!previous||previous.revision!==expectedRevision){error=new LibraryConflict();tx.abort();return;}
        const versions=tx.objectStore(counters).get(projectId);
        versions.onsuccess=()=>{try{
          const version=(versions.result?.version??0)+1,file=makePackage(id,version,previous);
          result={id,revision:1,updatedAt:Date.now(),format,schema:1,title:file.title,projectId,sourceRevision:previous.revision,package:file};
          tx.objectStore(store).add(result);heads.add(header(kind,result));if(safeThumbnail(thumbnail))tx.objectStore('previews').put({key:`${kind}:${id}`,image:thumbnail});tx.objectStore(counters).put({id:projectId,version});
        }catch(cause){error=cause;tx.abort();}};
      };
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error||tx.error||Error('The content package could not be saved. Your draft is unchanged.'));
    });
    this.#changed(store,id,1);return result;
  }
  async importRelease(file,validate,thumbnail){
    const data=validateRelease(file,validate);
    return this.#write('releases',crypto.randomUUID(),null,()=>({format:'solar-friends-frozen-release',schema:1,title:data.title,projectId:null,sourceRevision:null,package:data}),thumbnail);
  }
  async createRun({definition,snapshot,projectId=null,sessionKind='scenario',sourceRevision=null,releaseId=null,thumbnail}){
    if(!['scenario','playtest'].includes(sessionKind)||typeof snapshot!=='string'||snapshot.length>16*1024*1024)throw Error('This playthrough cannot be stored.');
    let release=null;
    if(releaseId){
      const record=await this.getRelease(releaseId);
      if(!record||canonical(record.package.definition)!==canonical(definition)||sessionKind!=='scenario')throw Error('Choose the exact frozen release before starting this village.');
      const p=record.package;release={id:record.id,packageId:p.id,content_revision:p.content_revision,author:p.author,compatibility:clone(p.compatibility),credits:clone(p.credits??[])};
    }
    const data=clone({definition,snapshot,projectId,sessionKind,sourceRevision,...(release?{release}:{})});
    return this.#write('runs',crypto.randomUUID(),null,()=>({format:'solar-friends-run',schema:1,title:definition.title,...data}),thumbnail);
  }
  async importRecoveredRun({definition,snapshot,release=null}){
    if(typeof snapshot!=='string'||snapshot.length>16*1024*1024||!definition?.start)throw Error('This recovered village cannot be stored.');
    const data=clone({definition,snapshot,release});
    return this.#write('runs',crypto.randomUUID(),null,()=>({format:'solar-friends-run',schema:1,title:definition.title,projectId:null,sessionKind:'scenario',sourceRevision:null,...data}));
  }
  saveRun(id,snapshot,expectedRevision){
    if(typeof snapshot!=='string'||snapshot.length>16*1024*1024)throw Error('This playthrough is too large to save.');
    return this.#write('runs',id,expectedRevision,previous=>{
      if(!previous)throw Error('This playthrough is missing.');
      // Definition and source revision are immutable throughout this run.
      return {...previous,previousSnapshot:previous.snapshot,snapshot};
    });
  }
  deleteRun(id,expectedRevision){return this.#write('runs',id,expectedRevision,()=>null);}
  close(){this.#channel?.close();this.#opening?.then(db=>db.close());this.#opening=null;}
}
