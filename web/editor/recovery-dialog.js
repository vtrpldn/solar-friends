import {recoveredDraft,recoveredVillage} from './record-recovery.js';
export function chooseRecoveryCheckpoint(file,{Game,validate}){
 const choices=['current','previous'].map(source=>{
  try{return {source,value:file.kind==='run'?recoveredVillage(file,Game,{source}):recoveredDraft(file,validate,{source})};}
  catch(error){return {source,error:error.message};}
 });
 const available=choices.filter(c=>c.value);if(!available.length)throw Error(choices[0].error);
 const dialog=document.createElement('dialog');dialog.id='creator-recovery-dialog';dialog.setAttribute('aria-labelledby','creator-recovery-title');
 const title=document.createElement('h2');title.id='creator-recovery-title';title.textContent='Choose a recovery checkpoint';dialog.append(title);
 const explanation=document.createElement('p');explanation.textContent='Recovery creates a separate copy. The original backup and existing saves stay unchanged.';dialog.append(explanation);
 const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Saved checkpoints';fieldset.append(legend);
 let selected=available[0];
 for(const choice of choices){
  const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='radio';input.name='recovery-checkpoint';input.value=choice.source;input.disabled=!choice.value;input.checked=choice===selected;
  input.onchange=()=>{selected=choice;};
  text.textContent=`${choice.source==='current'?'Current':'Previous'} checkpoint · ${choice.value?(file.kind==='run'?'Saved village':choice.value.playable?'Playable draft':'Draft needs attention'):'Cannot open in this version'}`;
  label.append(input,text);fieldset.append(label);
 }
 dialog.append(fieldset);
 const note=document.createElement('p');note.textContent=file.kind==='project'?'Draft recovery keeps the selected definition, supported undo history and editor view. Damaged undo history is cleared.':'Village recovery keeps the selected progress and its frozen restart scenario.';dialog.append(note);
 const actions=document.createElement('div');actions.className='dialog-actions';const cancel=document.createElement('button'),confirm=document.createElement('button');cancel.textContent='Cancel';cancel.id='creator-recovery-cancel';confirm.textContent='Recover a copy';confirm.id='creator-recovery-confirm';actions.append(cancel,confirm);dialog.append(actions);
 return new Promise(resolve=>{
  let result=null;cancel.onclick=()=>dialog.close();confirm.onclick=()=>{result=selected.value;dialog.close();};
  dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});
  document.body.append(dialog);dialog.showModal();confirm.focus();
 });
}
