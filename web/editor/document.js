// Drafts may be unplayable while editing. Native scenario validation decides
// when they can run; this module only owns atomic edits and their undo history.
const MAX_DOCUMENT_BYTES=2*1024*1024;
const MAX_HISTORY_BYTES=8*1024*1024;
const MAX_HISTORY_STEPS=64;
const encoder=new TextEncoder();
const bytes=value=>encoder.encode(value).length;

function encode(value){
  const raw=JSON.stringify(value,(_key,item)=>{
    if(typeof item==='number'&&!Number.isFinite(item))throw Error('Use a finite number for this value.');
    if(['undefined','function','symbol','bigint'].includes(typeof item))throw Error('Drafts can contain only serializable values.');
    return item;
  });
  if(!raw||bytes(raw)>MAX_DOCUMENT_BYTES)throw Error('This draft is too large to save.');
  return raw;
}
function definition(raw){
  const value=JSON.parse(raw);
  if(value?.format!=='solar-friends-scenario'||!Number.isInteger(value.schema)||!value.map||!value.start||!value.rules)throw Error('This is not a scenario draft.');
  return value;
}
function historySize(step){return bytes(step.before)+bytes(step.after)+bytes(step.label);}

export class EditorDocument extends EventTarget{
  #raw;
  #saved;
  #savedRevision=0;
  #past=[];
  #future=[];
  #revision=0;
  historyRecovered=false;

  constructor(initial){
    super();
    this.#raw=encode(initial);
    definition(this.#raw);
    this.#saved=this.#raw;
  }
  get value(){return definition(this.#raw);}
  get revision(){return this.#revision;}
  get dirty(){return this.#raw!==this.#saved;}
  get canUndo(){return this.#past.length>0;}
  get canRedo(){return this.#future.length>0;}
  get undoLabel(){return this.#past.at(-1)?.label||'';}
  get redoLabel(){return this.#future.at(-1)?.label||'';}

  transact(label,edit){
    if(typeof label!=='string'||!label.trim()||label.length>160)throw Error('Give this edit a short name.');
    const draft=this.value;
    const result=edit(draft);
    if(result&&typeof result.then==='function')throw Error('Complete an edit before starting asynchronous work.');
    const after=encode(draft);
    definition(after);
    if(after===this.#raw)return false;
    this.#past.push({label,before:this.#raw,after});
    this.#raw=after;
    this.#future=[];
    this.#trim();
    this.#changed();
    return true;
  }
  undo(){
    const step=this.#past.pop();
    if(!step)return false;
    this.#raw=step.before;
    this.#future.push(step);
    this.#changed();
    return true;
  }
  redo(){
    const step=this.#future.pop();
    if(!step)return false;
    this.#raw=step.after;
    this.#past.push(step);
    this.#changed();
    return true;
  }
  // A save acknowledgement applies to the exact revision written. A delayed
  // write must not mark newer, unwritten edits as saved.
  markSaved(checkpoint){
    if(checkpoint?.schema!==1||!Number.isSafeInteger(checkpoint.revision)||checkpoint.revision<0)throw Error('This is not a valid save acknowledgement.');
    const raw=encode(checkpoint.definition);
    if(checkpoint.revision>this.#revision)throw Error('This checkpoint belongs to a later revision.');
    if(checkpoint.revision<this.#savedRevision)return false;
    this.#saved=raw;
    this.#savedRevision=checkpoint.revision;
    this.dispatchEvent(new Event('saved'));
    return true;
  }
  checkpoint(){
    return {
      schema:1,
      revision:this.#revision,
      definition:this.value,
      history:structuredClone({past:this.#past,future:this.#future}),
    };
  }
  static restore(checkpoint){
    if(checkpoint?.schema!==1||!Number.isSafeInteger(checkpoint.revision)||checkpoint.revision<0)throw Error('This draft checkpoint is not supported.');
    const doc=new EditorDocument(checkpoint.definition);
    doc.#revision=checkpoint.revision;
    doc.#savedRevision=checkpoint.revision;
    if(checkpoint.history){
      try{
        const {past,future}=checkpoint.history;
        if(!Array.isArray(past)||!Array.isArray(future)||past.length+future.length>MAX_HISTORY_STEPS)throw Error('Invalid history.');
        let size=0;
        for(const step of [...past,...future]){
          if(typeof step?.label!=='string'||step.label.length>160||typeof step.before!=='string'||typeof step.after!=='string')throw Error('Invalid edit.');
          if(bytes(step.before)>MAX_DOCUMENT_BYTES||bytes(step.after)>MAX_DOCUMENT_BYTES)throw Error('Invalid edit size.');
          definition(step.before);definition(step.after);
          size+=historySize(step);
          if(size>MAX_HISTORY_BYTES)throw Error('Invalid history size.');
        }
        let cursor=doc.#raw;
        for(const step of [...past].reverse()){
          if(step.after!==cursor)throw Error('Undo history does not match the draft.');
          cursor=step.before;
        }
        cursor=doc.#raw;
        for(const step of [...future].reverse()){
          if(step.before!==cursor)throw Error('Redo history does not match the draft.');
          cursor=step.after;
        }
        doc.#past=structuredClone(past);doc.#future=structuredClone(future);
      }catch{
        // Preserve the actual draft even if only its undo journal is corrupt.
        // The workspace surfaces this recovery flag to the player.
        doc.historyRecovered=true;
      }
    }
    return doc;
  }
  #changed(){this.#revision++;this.dispatchEvent(new Event('change'));}
  #trim(){
    let size=this.#past.reduce((sum,step)=>sum+historySize(step),0);
    while(this.#past.length>MAX_HISTORY_STEPS||size>MAX_HISTORY_BYTES){
      size-=historySize(this.#past.shift());
    }
  }
}
