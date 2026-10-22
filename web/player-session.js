// Owns one independent custom playthrough or scratch playtest. Normal Story
// and Sandbox storage is deliberately absent from this controller.
export class PlayerSession {
  #writes=Promise.resolve();
  #lastRequested;
  #recovery;
  constructor(library,record,game,recovery=()=>sessionStorage){
    this.library=library;this.record=record;this.game=game;this.#recovery=recovery;
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
      const session=new PlayerSession(library,record,game,recovery);
      session.recovered=recovered;
      return session;
    }catch(error){game.free();throw error;}
  }
  get isTest(){return this.record.sessionKind==='playtest';}
  get id(){return this.record.id;}
  save(){
    const raw=this.game.snapshot();
    try{this.#recovery().setItem(`solar-friends-run-recovery:${this.id}`,JSON.stringify({revision:this.record.revision,snapshot:raw}));}catch{/* Saving to IndexedDB can still succeed. */}
    if(raw===this.#lastRequested)return this.#writes;
    this.#lastRequested=raw;
    const operation=this.#writes.catch(()=>{}).then(async()=>{
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
    return operation.catch(error=>{if(this.#lastRequested===raw)this.#lastRequested=null;throw error;});
  }
  async restartTest(){
    if(!this.isTest)throw Error('Only a playtest can be restarted here.');
    return this.restartScenario();
  }
  async restartScenario(){
    await this.#writes.catch(()=>{});
    const result=JSON.parse(this.game.load_scenario(JSON.stringify(this.record.definition)));
    if(!result.ok)throw Error(result.issues.map(i=>i.message).join(' '));
    this.#lastRequested=null;
    await this.save();
  }
  async finishTest(){
    await this.save();
    if(this.isTest){
      await this.library.deleteRun(this.id,this.record.revision);
      try{this.#recovery().removeItem(`solar-friends-run-recovery:${this.id}`);}catch{/* Scratch session ended. */}
    }
  }
  dispose({freeGame=true}={}){if(freeGame)this.game?.free();this.game=null;}
}
