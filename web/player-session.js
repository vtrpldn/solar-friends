// Owns one independent custom playthrough or scratch playtest. Normal Story
// and Sandbox storage is deliberately absent from this controller.
export class PlayerSession {
  #writes=Promise.resolve();
  #lastRequested;
  #recovery;
  #Game;
  #restarting=false;
  #restartController=null;
  constructor(library,record,game,recovery=()=>sessionStorage,Game=game.constructor){
    this.library=library;this.record=record;this.game=game;this.#recovery=recovery;this.#Game=Game;
    this.#lastRequested=record.snapshot;
  }
  static async open(library,id,Game,recovery){
    const record=await library.getRun(id);
    if(record?.format!=='solar-friends-run'||record.schema!==1)throw Error('This playthrough is missing or needs a different game version.');
    const game=new Game();
    let recovered=false;
    try{
      let raw=record.snapshot;
      try{
        const saved=JSON.parse((recovery||(()=>sessionStorage))().getItem(`solar-friends-run-recovery:${id}`)||'null');
        if(saved?.revision===record.revision&&typeof saved.snapshot==='string'&&game.restore(saved.snapshot)){raw=saved.snapshot;recovered=raw!==record.snapshot;}
      }catch{/* The durable record remains available when session storage is blocked. */}
      if(!game.restore(raw)){
        if(!record.previousSnapshot||!game.restore(record.previousSnapshot))throw Error('This playthrough could not load. Its original data is preserved.');
        recovered=true;
      }
      const session=new PlayerSession(library,record,game,recovery,Game);
      session.recovered=recovered;
      return session;
    }catch(error){game.free();throw error;}
  }
  get isTest(){return this.record.sessionKind==='playtest';}
  get id(){return this.record.id;}
  #cacheSnapshot(raw,onlyIfMissing=false){
    try{const storage=this.#recovery(),key=`solar-friends-run-recovery:${this.id}`;if(!onlyIfMissing||!storage.getItem(key))storage.setItem(key,JSON.stringify({revision:this.record.revision,snapshot:raw}));}catch{/* Saving to IndexedDB can still succeed. */}
  }
  #moveRecovery(oldId,raw){
    if(oldId===this.id)return;
    try{
      const storage=this.#recovery(),key=`solar-friends-run-recovery:${oldId}`,cached=JSON.parse(storage.getItem(key)||'null');
      if(cached&&cached.snapshot!==raw)storage.setItem(`solar-friends-run-recovery:${this.id}`,JSON.stringify({revision:this.record.revision,snapshot:cached.snapshot}));
      storage.removeItem(key);
    }catch{/* Preserve the old recovery and retry when the queued write starts. */}
  }
  save(){
    const raw=this.game.snapshot(),requestedId=this.id;
    this.#cacheSnapshot(raw);
    if(raw===this.#lastRequested)return this.#writes;
    this.#lastRequested=raw;
    const operation=this.#writes.catch(()=>{}).then(async()=>{
      // A preceding copy may have changed the target since this was queued.
      if(this.id!==requestedId){this.#moveRecovery(requestedId,raw);this.#cacheSnapshot(raw,true);}
      const record=await this.library.saveRun(this.id,raw,this.record.revision);
      this.record=record;
      try{
        const storage=this.#recovery(),key=`solar-friends-run-recovery:${this.id}`,cached=JSON.parse(storage.getItem(key)||'null');
        if(cached?.snapshot===raw)storage.removeItem(key);
        else if(cached)storage.setItem(key,JSON.stringify({...cached,revision:record.revision}));
      }catch{/* A durable checkpoint was committed successfully. */}
      return record;
    });
    this.#writes=operation;
    return operation.catch(error=>{if(this.#lastRequested===raw)this.#lastRequested=null;if(error.name==='LibraryConflict'){this.conflicted=true;this.onConflict?.();}throw error;});
  }
  saveCopy(){
    const raw=this.game.snapshot(),oldId=this.id,requestedBeforeCopy=this.#lastRequested;
    const operation=this.#writes.catch(()=>{}).then(async()=>{
      const record=await this.library.importRecoveredRun({definition:this.record.definition,snapshot:raw,release:this.record.release??null,attribution:this.record.attribution,title:(this.record.title+' · copy').slice(0,100)});
      this.record=record;if(this.#lastRequested===requestedBeforeCopy||this.#lastRequested===null)this.#lastRequested=raw;this.conflicted=false;
      this.#moveRecovery(oldId,raw);
      return record;
    });
    this.#writes=operation;return operation;
  }
  async restartTest(options){
    if(!this.isTest)throw Error('Only a playtest can be restarted here.');
    return this.restartScenario(options);
  }
  async restartScenario({prepare=async()=>{},signal:requestedSignal}={}){
    if(this.#restarting)throw Error('A scenario restart is already being prepared.');
    if(!this.game||typeof prepare!=='function')throw Error('Choose an open session and a resident preparation callback.');
    const original=this.game,controller=new AbortController(),signal=controller.signal,relay=()=>controller.abort(),abort=()=>new DOMException('Scenario restart cancelled.','AbortError');
    if(requestedSignal?.aborted)relay();else requestedSignal?.addEventListener('abort',relay,{once:true});
    let candidate=null,undo=null,accepting=true,onAbort;
    this.#restarting=true;this.#restartController=controller;
    try{
      if(signal?.aborted)throw abort();
      const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(abort());signal.addEventListener('abort',onAbort,{once:true});});
      await Promise.race([this.#writes.catch(()=>{}),cancelled]);
      if(signal?.aborted||this.game!==original)throw abort();
      candidate=new this.#Game();
      const result=JSON.parse(candidate.load_scenario(JSON.stringify(this.record.definition)));
      if(!result.ok)throw Error(result.issues.map(i=>i.message).join(' '));
      const raw=candidate.snapshot(),snapshot=JSON.parse(raw);
      const preparation=Promise.resolve().then(()=>{if(signal.aborted||!accepting)throw abort();return prepare(snapshot,{signal});}).then(value=>{
        if(!accepting||signal?.aborted||this.game!==original){if(typeof value==='function')value();throw abort();}
        return value;
      });
      undo=await Promise.race([preparation,cancelled]);
      if(signal?.aborted||this.game!==original)throw abort();
      const previous=original.snapshot(),key=`solar-friends-run-recovery:${this.id}`;let recovery,priorRecovery,readRecovery=false;
      try{recovery=this.#recovery();priorRecovery=recovery.getItem(key);readRecovery=true;}catch{/* Durable checkpoint remains authoritative. */}
      try{
        if(!original.restore(raw))throw Error('The prepared scenario could not be installed.');
        this.#lastRequested=null;
        await this.save();
      }catch(error){
        if(this.game===original&&!original.restore(previous))throw Error('The previous scenario state could not be restored.');
        this.#lastRequested=null;
        if(readRecovery)try{if(priorRecovery===null)recovery.removeItem(key);else recovery.setItem(key,priorRecovery);}catch{/* Current in-memory state and durable checkpoint remain preserved. */}
        throw error;
      }
      undo=null;
    }catch(error){if(typeof undo==='function')undo();throw error;}
    finally{accepting=false;signal.removeEventListener('abort',onAbort);requestedSignal?.removeEventListener('abort',relay);candidate?.free();this.#restarting=false;if(this.#restartController===controller)this.#restartController=null;}
  }
  async finishTest(){
    if(this.#restarting)throw Error('Cancel the scenario restart before leaving this playthrough.');
    await this.save();
    if(this.isTest){
      await this.library.deleteRun(this.id,this.record.revision);
      try{this.#recovery().removeItem(`solar-friends-run-recovery:${this.id}`);}catch{/* Scratch session ended. */}
    }
  }
  dispose({freeGame=true}={}){this.#restartController?.abort();if(freeGame)this.game?.free();this.game=null;}
}
