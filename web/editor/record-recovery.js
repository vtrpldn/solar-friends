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
