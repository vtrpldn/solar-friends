import {MAX_VILLAGE_SNAPSHOT_CHARACTERS} from '../recovery-limits.js';
import {draftImportIssue} from './draft-import.js';
import {EditorDocument} from './document.js';
// Recovery exports deliberately bypass game/schema validation. A newer or
// damaged record must remain available without opening or rewriting it.
export function recoveryRecord(kind,record){
 if(!['project','run','map','release','resident'].includes(kind))throw Error('Choose a supported library collection to back up.');
 if(record===null||record===undefined)throw Error('This saved entry is missing. No backup was created.');
 return JSON.stringify({format:'solar-friends-recovery',schema:1,kind,record},null,2);
}
export function downloadRecoveryRecord(kind,record){
 const text=recoveryRecord(kind,record),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
 try{const a=document.createElement('a');a.href=url;a.download=`solar-friends-${kind}-backup.json`;a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
// Import only understood envelopes. The retained original remains the recovery
// authority; this operation extracts a validated definition into a new draft.
export function recoveredDraft(file,validate,{source:requested=null}={}){
 if(file?.format!=='solar-friends-recovery'||file.schema!==1||file.kind!=='project'||file.record?.format!=='solar-friends-project'||file.record.schema!==1)throw Error('This backup needs another game version or is not a draft backup. Keep the original file.');
 const record=file.record;
 for(const [source,checkpoint]of [['current',record.checkpoint],['previous',record.previous?.checkpoint]]){
  if(requested&&source!==requested)continue;
  if(checkpoint?.schema!==1||!checkpoint.definition)continue;
  const definition=structuredClone(checkpoint.definition),checked=validate(JSON.stringify(definition));
  if(draftImportIssue(checked))continue;
  let doc;try{doc=Number.isSafeInteger(checkpoint.revision)?EditorDocument.restore(checkpoint):new EditorDocument(definition);}catch{continue;}
  return {definition,checkpoint:doc.checkpoint(),view:structuredClone(source==='current'?record.view:record.previous?.view),historyRecovered:doc.historyRecovered,source,playable:checked.ok,attribution:structuredClone(record.attribution??[])};
 }
 throw Error('Neither draft checkpoint can open in this game version. Keep the original backup; nothing was imported.');
}
export function recoveredVillage(file,Game,{source:requested=null}={}){
 if(file?.format!=='solar-friends-recovery'||file.schema!==1||file.kind!=='run'||file.record?.format!=='solar-friends-run'||file.record.schema!==1||file.record.sessionKind!=='scenario')throw Error('This backup is not a supported saved village. Keep the original file.');
 const record=file.record,game=new Game();
 try{
  for(const [source,snapshot]of [['current',record.snapshot],['previous',record.previousSnapshot]]){
   if(requested&&source!==requested)continue;
   if(typeof snapshot!=='string'||snapshot.length>MAX_VILLAGE_SNAPSHOT_CHARACTERS||!game.restore(snapshot))continue;
   const restored=JSON.parse(game.snapshot()),definition=restored.village?.scenario?.definition;
   if(!definition)continue;
   // Restart uses the same frozen definition that native restoration accepted,
   // never a conflicting or damaged outer record definition.
   const attribution=Array.isArray(record.attribution)&&record.attribution.length<=17
    ?record.attribution.filter(c=>typeof c?.release==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(c.release)&&
      Number.isInteger(c.revision)&&c.revision>0&&c.revision<=0xffffffff&&
      typeof c.author==='string'&&c.author.length<=160)
      .map(({release,revision,author})=>({release,revision,author}))
    :undefined;
   return {source,snapshot:game.snapshot(),definition,release:structuredClone(record.release??null),...(attribution?{attribution}:{})};
  }
 }finally{game.free();}
 throw Error('Neither village checkpoint can open in this game version. Keep the original backup; nothing was imported.');
}
