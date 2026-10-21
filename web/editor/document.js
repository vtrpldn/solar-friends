import {canonical,difference,validateChanges,applyChanges,signature,sameSignature,validSignature} from './journal.js';
// Drafts may be unplayable while editing. Native scenario validation decides
// when they can run; this module only owns atomic edits and their undo history.
const MAX_DOCUMENT_BYTES=2*1024*1024;
const MAX_HISTORY_BYTES=8*1024*1024;
const MAX_HISTORY_STEPS=64;
const encoder=new TextEncoder();
const bytes=value=>encoder.encode(value).length;

function encode(value){
  const raw=canonical(value);
  if(!raw||bytes(raw)>MAX_DOCUMENT_BYTES)throw Error('This draft is too large to save.');
  return raw;
}
function definition(raw){
  const value=JSON.parse(raw);
  if(value?.format!=='solar-friends-scenario'||!Number.isInteger(value.schema)||!value.map||!value.start||!value.rules)throw Error('This is not a scenario draft.');
  return value;
}
function historySize(step){return bytes(canonical(step));}
function stepFor(label,before,after){
  const a=definition(before),b=definition(after),step={label,before:signature(before),after:signature(after),changes:difference(a,b,before.length+after.length)};
  if(historySize(step)>MAX_HISTORY_BYTES)step.changes=[{path:[],before:{exists:true,value:a},after:{exists:true,value:b}}];
  return step;
}
function applyStep(raw,step,forward){
  if(!sameSignature(signature(raw),forward?step.before:step.after))throw Error('History does not match the draft.');
  const next=encode(applyChanges(definition(raw),step.changes,forward));definition(next);
  if(!sameSignature(signature(next),forward?step.after:step.before))throw Error('History does not restore the draft.');
  return next;
}

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
    this.#past.push(stepFor(label,this.#raw,after));
    this.#raw=after;
    this.#future=[];
    this.#trim();
    this.#changed();
    return true;
  }
  undo(){
    const step=this.#past.at(-1);
    if(!step)return false;
    const raw=applyStep(this.#raw,step,false);
    this.#past.pop();this.#raw=raw;
    this.#future.push(step);
    this.#changed();
    return true;
  }
  redo(){
    const step=this.#future.at(-1);
    if(!step)return false;
    const raw=applyStep(this.#raw,step,true);
    this.#future.pop();this.#raw=raw;
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
      history:structuredClone({format:2,past:this.#past,future:this.#future}),
    };
  }
  static restore(checkpoint){
    if(checkpoint?.schema!==1||!Number.isSafeInteger(checkpoint.revision)||checkpoint.revision<0)throw Error('This draft checkpoint is not supported.');
    const doc=new EditorDocument(checkpoint.definition);
    doc.#revision=checkpoint.revision;
    doc.#savedRevision=checkpoint.revision;
    if(checkpoint.history){
      try{
        let {past,future,format=1}=checkpoint.history;
        if(!Array.isArray(past)||!Array.isArray(future)||past.length+future.length>MAX_HISTORY_STEPS)throw Error('Invalid history.');
        if(![1,2].includes(format))throw Error('Unsupported history.');
        let size=0;
        const normalize=step=>{
          if(typeof step?.label!=='string'||!step.label.trim()||step.label.length>160)throw Error('Invalid edit.');
          if(format===1){
            if(typeof step.before!=='string'||typeof step.after!=='string')throw Error('Invalid legacy history.');
            size+=bytes(step.before)+bytes(step.after)+bytes(step.label);
            if(size>MAX_HISTORY_BYTES)throw Error('Invalid legacy history size.');
            const before=definition(encode(definition(step.before))),after=definition(encode(definition(step.after)));
            return stepFor(step.label,encode(before),encode(after));
          }
          if(Object.keys(step).sort().join(',')!=='after,before,changes,label'||!validSignature(step.before,MAX_DOCUMENT_BYTES)||!validSignature(step.after,MAX_DOCUMENT_BYTES))throw Error('Invalid edit fields.');
          validateChanges(step.changes,encode);return step;
        };
        past=past.map(normalize);future=future.map(normalize);
        if([...past,...future].reduce((n,step)=>n+historySize(step),0)>MAX_HISTORY_BYTES)throw Error('Invalid history size.');
        let cursor=doc.#raw;
        for(const step of [...past].reverse()){
          cursor=applyStep(cursor,step,false);
        }
        cursor=doc.#raw;
        for(const step of [...future].reverse()){
          cursor=applyStep(cursor,step,true);
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
