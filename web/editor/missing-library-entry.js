const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actions={project:['open-project','Edit'],run:['continue-run','Continue'],release:['play-release','Play'],map:['use-map','Create scenario'],resident:['use-resident','Add to cast']};
export function missingLibraryEntry(kind,entry){
 const [action,label]=actions[kind];
 return `<div class="creator-library-row" ${kind==='resident'?`data-preset-id="${escape(entry.id)}"`:""} data-missing-entry="${kind}:${escape(entry.id)}"><div><b>${escape(entry.title)}</b><small>Saved data is missing. Entry details cannot restore the content. Import an exported backup as a separate copy.</small></div><button data-${action}="${escape(entry.id)}" disabled>${label}</button><button data-backup-missing-kind="${kind}" data-backup-missing-id="${escape(entry.id)}">Save entry details</button></div>`;
}
export async function downloadMissingEntryDetails(library,kind,id){
 const entry=await library.getEntryDetails(kind,id);if(!entry)throw Error('This library entry is no longer available.');
 const text=JSON.stringify({format:'solar-friends-library-entry',schema:1,kind,entry},null,2),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
 try{const a=document.createElement('a');a.href=url;a.download='solar-friends-missing-entry-details.json';a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
