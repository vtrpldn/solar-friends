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
  // Only internally owned entries are cached. Restored caller data is measured
  // afresh before cloning, so mutating a checkpoint cannot bypass byte limits.
  #historySizes=new WeakMap();
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
  // Inspect one history target without mutating the document or copying its
  // complete journal. Preparation may be cancelled before the real step runs.
  historyTarget(redo=false){
    const step=(redo?this.#future:this.#past).at(-1);
    return step?definition(applyStep(this.#raw,step,redo)):null;
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
      // Journal entries contain validated JSON data only. The JSON clone keeps
      // checkpoints independently mutable without structured-cloning hundreds
      // of thousands of tiny change objects near the history byte limit.
      history:JSON.parse(JSON.stringify({format:2,past:this.#past,future:this.#future})),
    };
  }
  async checkpointAsync({yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
    // Capture before yielding. Transactions replace entries rather than mutate
    // them, so edits/undo/redo during copying cannot mix checkpoint revisions.
    const raw=this.#raw,revision=this.#revision,past=[...this.#past],future=[...this.#future];
    const history={format:2,past:[],future:[]};
    await yieldControl();
    let count=0;
    for(const [name,steps]of [['past',past],['future',future]])for(const step of steps){
      history[name].push(JSON.parse(JSON.stringify(step)));
      if(++count%4===0)await yieldControl();
    }
    return {schema:1,revision,definition:definition(raw),history};
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
  static fork(checkpoint,id){
    if(typeof id!=='string'||!id||id.length>100)throw Error('Choose a supported identity for the recovered draft.');
    const source=EditorDocument.restore(checkpoint),copy=new EditorDocument(source.value);
    const rebind=raw=>{const d=definition(raw);d.id=id;d.map.id='map-'+id;d.revision=1;d.map.revision=1;return encode(d);};
    copy.#raw=rebind(source.#raw);copy.#saved=copy.#raw;
    let cursor=source.#raw;
    for(const step of [...source.#past].reverse()){
      const before=applyStep(cursor,step,false);copy.#past.unshift(stepFor(step.label,rebind(before),rebind(cursor)));cursor=before;
    }
    cursor=source.#raw;
    for(const step of [...source.#future].reverse()){
      const after=applyStep(cursor,step,true);copy.#future.unshift(stepFor(step.label,rebind(cursor),rebind(after)));cursor=after;
    }
    copy.historyRecovered=source.historyRecovered;
    // Revalidate the combined imported journal against the existing total
    // byte/step limits before publishing the independent document.
    const checked=EditorDocument.restore(copy.checkpoint());
    checked.historyRecovered ||= copy.historyRecovered;
    return checked;
  }
  #changed(){this.#revision++;this.dispatchEvent(new Event('change'));}
  #trim(){
    const sizeOf=step=>{
      let size=this.#historySizes.get(step);
      if(size===undefined){size=historySize(step);this.#historySizes.set(step,size);}
      return size;
    };
    let size=this.#past.reduce((sum,step)=>sum+sizeOf(step),0);
    while(this.#past.length>MAX_HISTORY_STEPS||size>MAX_HISTORY_BYTES){
      size-=sizeOf(this.#past.shift());
    }
  }
}
