import {downloadRecoveryRecord} from './record-recovery.js';
// Package export does not validate native content: future versions must remain
// exportable. Missing/malformed package envelopes fall back to the whole record.
export function downloadStoredPackage(kind,record){
 const fields={map:['package','map','solar-friends-map','solar-map'],release:['package','definition','solar-friends-release','solar-release'],resident:['file','resident','solar-friends-resident','solar-resident']},spec=Object.hasOwn(fields,kind)?fields[kind]:null;
 if(!spec||!record)throw Error('This saved record is unavailable. Keep its remaining entry details.');
 const [field,content,format,extension]=spec,file=record[field],object=value=>value&&typeof value==='object'&&!Array.isArray(value);
 if(!object(file)||file.format!==format||!object(file[content])){downloadRecoveryRecord(kind,record);return {backup:true};}
 const url=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:'application/json'}));
 try{const a=document.createElement('a');a.href=url;a.download=kind==='resident'?((String(file.resident.name??'resident').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-')||'resident')+'.solar-resident'):`${kind==='map'?'land':'village'}-v${file.content_revision}.${extension}`;a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return {backup:false};
}
