// Recovery exports deliberately bypass game/schema validation. A newer or
// damaged record must remain available without opening or rewriting it.
export function recoveryRecord(kind,record){
 if(!['project','run'].includes(kind))throw Error('Choose a draft or village backup.');
 if(record===null||record===undefined)throw Error('This saved entry is missing. No backup was created.');
 return JSON.stringify({format:'solar-friends-recovery',schema:1,kind,record},null,2);
}
export function downloadRecoveryRecord(kind,record){
 const text=recoveryRecord(kind,record),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
 try{const a=document.createElement('a');a.href=url;a.download=`solar-friends-${kind}-backup.json`;a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
// Import only understood envelopes. The retained original remains the recovery
// authority; this operation extracts a validated definition into a new draft.
export function recoveredDraft(file,validate){
 if(file?.format!=='solar-friends-recovery'||file.schema!==1||file.kind!=='project'||file.record?.format!=='solar-friends-project'||file.record.schema!==1)throw Error('This backup needs another game version or is not a draft backup. Keep the original file.');
 const record=file.record;
 for(const [source,checkpoint]of [['current',record.checkpoint],['previous',record.previous?.checkpoint]]){
  if(checkpoint?.schema!==1||!checkpoint.definition)continue;
  const definition=structuredClone(checkpoint.definition),checked=validate(JSON.stringify(definition));
  if(checked?.ok)return {definition,source,attribution:structuredClone(record.attribution??[])};
 }
 throw Error('Neither draft checkpoint can open in this game version. Keep the original backup; nothing was imported.');
}
export function recoveredVillage(file,Game){
 if(file?.format!=='solar-friends-recovery'||file.schema!==1||file.kind!=='run'||file.record?.format!=='solar-friends-run'||file.record.schema!==1||file.record.sessionKind!=='scenario')throw Error('This backup is not a supported saved village. Keep the original file.');
 const record=file.record,game=new Game();
 try{
  for(const [source,snapshot]of [['current',record.snapshot],['previous',record.previousSnapshot]]){
   if(typeof snapshot!=='string'||snapshot.length>16*1024*1024||!game.restore(snapshot))continue;
   const restored=JSON.parse(game.snapshot()),definition=restored.village?.scenario?.definition;
   if(!definition)continue;
   // Restart uses the same frozen definition that native restoration accepted,
   // never a conflicting or damaged outer record definition.
   return {source,snapshot:game.snapshot(),definition,release:structuredClone(record.release??null)};
  }
 }finally{game.free();}
 throw Error('Neither village checkpoint can open in this game version. Keep the original backup; nothing was imported.');
}
