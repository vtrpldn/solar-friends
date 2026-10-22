// Projects, frozen playthrough content, and their saves never share mode slots.
export class LibraryConflict extends Error {
  constructor(){super('Another tab changed this creation. Reload it or save your work as a copy.');this.name='LibraryConflict';}
}
const clone=value=>structuredClone(value);
const recordKind=store=>({projects:'project',runs:'run',residents:'resident'})[store];
const header=(kind,record)=>({key:`${kind}:${record.id}`,kind,id:record.id,title:record.title,revision:record.revision,updatedAt:record.updatedAt,sessionKind:record.sessionKind,projectId:record.projectId,residentBalance:(record.definition??record.checkpoint?.definition)?.start?.resident_balance??'balanced'});
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
      const request=indexedDB.open(this.name,2);let blocked=false;
      request.onupgradeneeded=()=>{
        for(const name of ['projects','runs','residents','heads'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:name==='heads'?'key':'id'});
        const heads=request.transaction.objectStore('heads');if(!heads.indexNames.contains('kind'))heads.createIndex('kind','kind',{unique:false});
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
  async #write(store,id,expected,update){
    const db=await this.#db();
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction([store,'heads'],'readwrite'),records=tx.objectStore(store),request=records.get(id);
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
          }else{
            records.delete(id);tx.objectStore('heads').delete(`${recordKind(store)}:${id}`);
          }
        }catch(cause){error=cause;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result??null);
      tx.onabort=()=>reject(error||tx.error||Error('Your creation could not be saved. Export a copy before closing.'));
    });
    const detail={kind:store,id,revision:result?.revision??null};
    this.#channel?.postMessage(detail);this.dispatchEvent(new CustomEvent('change',{detail}));
    return result;
  }
  listProjects(){return this.#list('project');}
  listRuns(){return this.#list('run');}
  listResidentPresets(){return this.#list('resident');}
  getResidentPreset(id){return this.#read('residents',id);}
  saveResidentPreset({id,file},expectedRevision=null){
    if(file?.format!=='solar-friends-resident'||file.schema!==1||typeof file.resident?.name!=='string'||'id' in file.resident||new TextEncoder().encode(JSON.stringify(file)).length>64*1024)throw Error('This resident preset cannot be stored.');
    const data=clone(file);
    return this.#write('residents',id,expectedRevision,()=>({format:'solar-friends-resident-preset',schema:1,title:data.resident.name,file:data}));
  }
  deleteResidentPreset(id,expectedRevision){return this.#write('residents',id,expectedRevision,()=>null);}
  getProject(id){return this.#read('projects',id);}
  getRun(id){return this.#read('runs',id);}
  async saveProject({id,checkpoint,view},expectedRevision=null){
    if(checkpoint?.schema!==1||!Number.isSafeInteger(checkpoint.revision)||!checkpoint.definition?.start)throw Error('This draft checkpoint is not supported.');
    const data=clone({checkpoint,view:safeView(view)});
    return this.#write('projects',id,expectedRevision,previous=>({
      format:'solar-friends-project',schema:1,...data,
      title:checkpoint.definition.title,
      previous:previous?{checkpoint:{...previous.checkpoint,history:undefined},view:previous.view}:null,
    }));
  }
  deleteProject(id,expectedRevision){return this.#write('projects',id,expectedRevision,()=>null);}
  async createRun({definition,snapshot,projectId=null,sessionKind='scenario',sourceRevision=null}){
    if(!['scenario','playtest'].includes(sessionKind)||typeof snapshot!=='string'||snapshot.length>16*1024*1024)throw Error('This playthrough cannot be stored.');
    const data=clone({definition,snapshot,projectId,sessionKind,sourceRevision});
    return this.#write('runs',crypto.randomUUID(),null,()=>({format:'solar-friends-run',schema:1,title:definition.title,...data}));
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
