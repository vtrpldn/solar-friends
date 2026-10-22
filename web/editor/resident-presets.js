import {addResident} from './roster.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const residentFile=(person,{author='Our community',title=person.name,description=person.biography??''}={})=>{const resident=structuredClone(person);delete resident.id;return {format:'solar-friends-resident',schema:2,id:crypto.randomUUID(),content_revision:1,title,description,author:author.trim(),compatibility:{game:1,ruleset:1,assets:1},credits:[],resident};};
export class ResidentPresetLibrary{
 constructor({library,engine,presets,maximum,source,change,notify}){
  Object.assign(this,{library,engine,presets,maximum,source,change,notify});
  this.dialog=document.createElement('dialog');this.dialog.id='creator-resident-presets-dialog';this.dialog.setAttribute('aria-labelledby','resident-presets-title');
  this.dialog.innerHTML='<button class="dialog-close" aria-label="Close resident presets">×</button><h2 id="resident-presets-title">People to bring along</h2><p>Reuse a saved character in any creation. Every addition gets a new identity and starts without shared memories. Current skill-budget rules still apply.</p><label class="creator-field">Find a resident<input type="search" maxlength="200" data-resident-search placeholder="Name, title or author"></label><p data-resident-search-results role="status"></p><div data-resident-preset-list></div><p data-resident-preset-status role="status"></p><div class="dialog-actions"><button type="button" data-import-resident>Import resident</button><button type="button" data-close-residents>Done</button></div><input type="file" accept=".solar-resident,.json" data-resident-file hidden>';
  document.body.append(this.dialog);
  this.saveDialog=document.createElement('dialog');this.saveDialog.id='creator-resident-save-dialog';this.saveDialog.setAttribute('aria-labelledby','resident-save-title');
  this.saveDialog.innerHTML='<h2 id="resident-save-title">Save a resident</h2><p>A reusable character starts fresh in each village. Your author name travels with the shared file.</p><form><label class="creator-field">Preset title<input type="text" name="title" required maxlength="100"></label><label class="creator-field">Description<textarea name="description" maxlength="1200" rows="3"></textarea></label><label class="creator-field">Author display name<input type="text" name="author" required maxlength="80" value="Our community"></label><p data-resident-save-status role="status"></p><div class="dialog-actions"><button type="button" data-cancel-save>Cancel</button><button type="submit">Save resident</button></div></form>';
  document.body.append(this.saveDialog);const form=this.saveDialog.querySelector('form');
  this.saveDialog.querySelector('[data-cancel-save]').onclick=()=>this.saveDialog.close();
  this.saveDialog.addEventListener('cancel',event=>{if(this.saving)event.preventDefault();});
  form.onsubmit=async event=>{event.preventDefault();if(this.saving||!this.pendingPerson||!form.reportValidity())return;this.saving=true;for(const button of form.querySelectorAll('button'))button.disabled=true;
   try{const file=residentFile(this.pendingPerson,{title:form.elements.title.value,description:form.elements.description.value,author:form.elements.author.value});this.validate(file,true);await library.saveResidentPreset({id:crypto.randomUUID(),file});this.saveDialog.close();this.notify(`${this.pendingPerson.name} saved to resident presets.`);}catch(error){this.saveDialog.querySelector('[data-resident-save-status]').textContent=error.message;}finally{this.saving=false;for(const button of form.querySelectorAll('button'))button.disabled=false;}
  };
  this.list=this.dialog.querySelector('[data-resident-preset-list]');this.status=this.dialog.querySelector('[data-resident-preset-status]');
  this.dialog.querySelector('.dialog-close').onclick=this.dialog.querySelector('[data-close-residents]').onclick=()=>this.dialog.close();
  this.search=this.dialog.querySelector('[data-resident-search]');this.search.oninput=()=>this.filter();
  const input=this.dialog.querySelector('[data-resident-file]');this.dialog.querySelector('[data-import-resident]').onclick=()=>input.click();
  input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>64*1024)throw Error('Keep resident files under 64 KiB.');const value=JSON.parse(await file.text());this.validate(value,true);await library.saveResidentPreset({id:crypto.randomUUID(),file:value});this.search.value='';await this.render();this.status.textContent='Imported as a separate resident preset.';}catch(error){this.status.textContent=error.message;}finally{input.value='';}};
  this.list.onclick=async event=>{
   const button=event.target.closest('[data-use-resident],[data-export-resident],[data-delete-resident],[data-copy-resident]');if(!button)return;
   button.disabled=true;
   try{
    const context=source(),record=await library.getResidentPreset(button.dataset.useResident??button.dataset.exportResident??button.dataset.deleteResident??button.dataset.copyResident);
    if(!record)throw Error('This preset was removed. Reopen the library to refresh it.');
    if(record.revision!==Number(button.dataset.revision))throw Error('This preset changed in another tab. Reopen the library before using it.');
    if(button.hasAttribute('data-delete-resident')){await library.deleteResidentPreset(record.id,record.revision);await this.render();this.status.textContent='Preset removed. Residents already in villages are unchanged.';return;}
    if(button.hasAttribute('data-copy-resident')){await library.saveResidentPreset({id:crypto.randomUUID(),file:record.file});this.search.value='';await this.render();this.status.textContent='Independent preset copy saved with its original authorship.';return;}
    if(button.hasAttribute('data-export-resident')){this.download(record.file);return;}
    this.validate(record.file,true);
    const latest=source();if(context.id!==latest.id||context.revision!==latest.revision)throw Error('The draft changed. Choose the preset again.');
    this.validate(record.file,latest.definition.start.resident_balance==='unrestricted');
    if(change('Add saved resident',d=>addResident(d,presets,maximum,{profile:record.file.resident})))this.dialog.close();
   }catch(error){this.status.textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}
  };
 }
 validate(file,unrestricted){const report=JSON.parse(this.engine.validate_resident_preset(JSON.stringify(file),unrestricted));if(!report.ok)throw Error(report.issues.find(i=>i.severity==='error')?.message||'This resident preset is unavailable.');}
 async save(person){this.pendingPerson=structuredClone(person);const form=this.saveDialog.querySelector('form');form.elements.title.value=person.name;form.elements.description.value=person.biography??'';this.saveDialog.querySelector('[data-resident-save-status]').textContent='';this.saveDialog.showModal();}
 async open(){this.status.textContent='';this.dialog.showModal();try{await this.render();}catch(error){this.status.textContent=error.message;}}
 async render(){this.records=await this.library.listResidentPresets();this.list.innerHTML=this.records.length?this.records.map(r=>`<article class="creator-resident-preset" data-preset-id="${escape(r.id)}"><b>${escape(r.title)}</b><small>${r.author?`Version ${escape(r.contentRevision)} · ${escape(r.author)}`:'Legacy preset · unversioned compatibility'}</small><div><button type="button" data-revision="${r.revision}" data-use-resident="${escape(r.id)}">Add to cast</button><button type="button" data-revision="${r.revision}" data-export-resident="${escape(r.id)}">Export</button><button type="button" data-revision="${r.revision}" data-copy-resident="${escape(r.id)}">Copy</button><button type="button" data-revision="${r.revision}" data-delete-resident="${escape(r.id)}">Delete preset</button></div></article>`).join(''):'<p>No saved residents yet. Customize someone in Founding cast, then choose Save resident preset.</p>';this.filter();}
 filter(){const fold=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase(),words=fold(this.search.value).trim().split(/\s+/u).filter(Boolean),records=new Map((this.records??[]).map(r=>[r.id,r]));let visible=0;for(const row of this.list.querySelectorAll('[data-preset-id]')){const r=records.get(row.dataset.presetId),text=fold(`${r?.title??''} ${r?.residentName??''} ${r?.author??''}`);row.hidden=!words.every(word=>text.includes(word));if(!row.hidden)visible++;}this.dialog.querySelector('[data-resident-search-results]').textContent=words.length?(visible?`${visible} matching resident presets`:'No matching residents. Clear the search to see everyone.'):`${visible} resident preset${visible===1?'':'s'}`;}

 download(file){const pretty=JSON.stringify(file,null,2),raw=new TextEncoder().encode(pretty).length<=64*1024?pretty:JSON.stringify(file),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=(String(file.resident?.name??'resident').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-')||'resident')+'.solar-resident';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
