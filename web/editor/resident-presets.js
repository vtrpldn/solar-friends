import {addResident} from './roster.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const residentFile=person=>{const resident=structuredClone(person);delete resident.id;return {format:'solar-friends-resident',schema:1,resident};};
export class ResidentPresetLibrary{
 constructor({library,engine,presets,maximum,source,change,notify}){
  Object.assign(this,{library,engine,presets,maximum,source,change,notify});
  this.dialog=document.createElement('dialog');this.dialog.id='creator-resident-presets-dialog';this.dialog.setAttribute('aria-labelledby','resident-presets-title');
  this.dialog.innerHTML='<button class="dialog-close" aria-label="Close resident presets">×</button><h2 id="resident-presets-title">People to bring along</h2><p>Reuse a saved character in any creation. Every addition gets a new identity and starts without shared memories. Current skill-budget rules still apply.</p><div data-resident-preset-list></div><p data-resident-preset-status role="status"></p><div class="dialog-actions"><button type="button" data-import-resident>Import resident</button><button type="button" data-close-residents>Done</button></div><input type="file" accept=".solar-resident,.json" data-resident-file hidden>';
  document.body.append(this.dialog);
  this.list=this.dialog.querySelector('[data-resident-preset-list]');this.status=this.dialog.querySelector('[data-resident-preset-status]');
  this.dialog.querySelector('.dialog-close').onclick=this.dialog.querySelector('[data-close-residents]').onclick=()=>this.dialog.close();
  const input=this.dialog.querySelector('input');this.dialog.querySelector('[data-import-resident]').onclick=()=>input.click();
  input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>64*1024)throw Error('Keep resident files under 64 KiB.');const value=JSON.parse(await file.text());this.validate(value,true);await library.saveResidentPreset({id:crypto.randomUUID(),file:value});await this.render();this.status.textContent='Imported as a separate resident preset.';}catch(error){this.status.textContent=error.message;}finally{input.value='';}};
  this.list.onclick=async event=>{
   const button=event.target.closest('[data-use-resident],[data-export-resident],[data-delete-resident]');if(!button)return;
   button.disabled=true;
   try{
    const context=source(),record=await library.getResidentPreset(button.dataset.useResident??button.dataset.exportResident??button.dataset.deleteResident);
    if(!record)throw Error('This preset was removed. Reopen the library to refresh it.');
    if(record.revision!==Number(button.dataset.revision))throw Error('This preset changed in another tab. Reopen the library before using it.');
    if(button.hasAttribute('data-delete-resident')){await library.deleteResidentPreset(record.id,record.revision);await this.render();this.status.textContent='Preset removed. Residents already in villages are unchanged.';return;}
    if(button.hasAttribute('data-export-resident')){this.download(record.file);return;}
    this.validate(record.file,true);
    const latest=source();if(context.id!==latest.id||context.revision!==latest.revision)throw Error('The draft changed. Choose the preset again.');
    this.validate(record.file,latest.definition.start.resident_balance==='unrestricted');
    if(change('Add saved resident',d=>addResident(d,presets,maximum,{profile:record.file.resident})))this.dialog.close();
   }catch(error){this.status.textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}
  };
 }
 validate(file,unrestricted){const report=JSON.parse(this.engine.validate_resident_preset(JSON.stringify(file),unrestricted));if(!report.ok)throw Error(report.issues.find(i=>i.severity==='error')?.message||'This resident preset is unavailable.');}
 async save(person){try{const file=residentFile(person);this.validate(file,true);await this.library.saveResidentPreset({id:crypto.randomUUID(),file});this.notify(`${person.name} saved to resident presets.`);}catch(error){this.notify(error.message);}}
 async open(){this.status.textContent='';this.dialog.showModal();try{await this.render();}catch(error){this.status.textContent=error.message;}}
 async render(){const records=await this.library.listResidentPresets();this.list.innerHTML=records.length?records.map(r=>`<article class="creator-resident-preset"><b>${escape(r.title)}</b><div><button type="button" data-revision="${r.revision}" data-use-resident="${escape(r.id)}">Add to cast</button><button type="button" data-revision="${r.revision}" data-export-resident="${escape(r.id)}">Export</button><button type="button" data-revision="${r.revision}" data-delete-resident="${escape(r.id)}">Delete preset</button></div></article>`).join(''):'<p>No saved residents yet. Customize someone in Founding cast, then choose Save resident preset.</p>';}
 download(file){const pretty=JSON.stringify(file,null,2),raw=new TextEncoder().encode(pretty).length<=64*1024?pretty:JSON.stringify(file),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=(String(file.resident?.name??'resident').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-')||'resident')+'.solar-resident';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
