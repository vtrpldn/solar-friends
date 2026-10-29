import {paintResidentShadow} from '../resident-ground-shadow.js';
import {paintResidentPortrait} from '../resident-portrait.js';
import {characterCategories,randomizeCharacter,resetCharacterCategory} from './character-choices.js';
import {residentClips,sampleResidentClip,drawResidentAnimation,presentedPoseLayers} from '../resident-animation.js';
import {RESIDENT_WIDTH} from '../sprite-frames.js';
import {paintWorldBuilding} from '../world-renderer.js';
import {unlitFilter} from '../power.js';
const pages=['Identity','Appearance','Personality','Experience','Arrival'];
const poses={breathe:'Idle',walk:'Walking',work:'Working',cook:'Cooking',water:'Watering',tend:'Tending',feed:'Feeding',sit:'Sitting',sleep:'Sleeping',look:'Looking around',stretch:'Stretching',wave:'Waving',relax:'Relaxing'};
export class CharacterCreator{
 constructor({art,source,groups,changeField,undo,redo,history,catalog,editPerson,startAction}){
  Object.assign(this,{art,source,groups,history,catalog});this.id=null;this.page='Identity';this.token=0;this.frame=null;
  this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.surface=document.createElement('canvas');this.surface.width=this.surface.height=256;
  this.dialog=document.createElement('dialog');this.dialog.id='character-creator';this.dialog.setAttribute('aria-labelledby','character-creator-title');
  this.dialog.innerHTML='<button class="dialog-close" aria-label="Close character creator">×</button><h2 id="character-creator-title">Meet our neighbour</h2><p>Changes belong to this creation. Use Undo to restore earlier choices.</p><div class="character-layout"><section class="character-preview"><canvas width="320" height="240" data-character-preview aria-label="Animated resident preview"></canvas><div class="character-portrait"><canvas width="64" height="72" aria-label="Matching resident portrait"></canvas><p data-character-name></p></div><label class="creator-field">Preview activity<select data-character-pose></select></label><label class="creator-field">Facing<select data-character-facing><option value="1">Right</option><option value="-1">Left</option></select></label><label class="creator-field">Lighting<select data-character-light><option value="0">Day</option><option value="1">Night</option></select></label><label><input type="checkbox" data-character-scale> Scale beside a home and neighbour</label><p data-character-preview-status role="status"></p></section><section class="character-settings"><div role="tablist" aria-label="Character settings"></div><div class="character-choice-actions"><label><input type="checkbox" data-character-lock> <span data-character-lock-label></span></label><button type="button" data-character-reset>Reset category</button><button type="button" data-character-random>Randomize unlocked categories</button><small>Reset restores this category to when you opened the creator.</small><small data-character-random-note></small></div><div data-character-fields></div></section></div><div class="dialog-actions"><button type="button" data-character-undo>Undo</button><button type="button" data-character-redo>Redo</button><button type="button" data-character-done>Done</button></div>';
  document.body.append(this.dialog);this.canvas=this.dialog.querySelector('[data-character-preview]');this.portrait=this.dialog.querySelector('.character-portrait canvas');this.fieldHost=this.dialog.querySelector('[data-character-fields]');
  const pose=this.dialog.querySelector('[data-character-pose]');for(const [key,title]of Object.entries(poses))pose.add(new Option(title,key));
  const tabs=this.dialog.querySelector('[role=tablist]');
  for(const name of pages){const tab=document.createElement('button');tab.type='button';tab.role='tab';tab.id='character-tab-'+name;tab.dataset.characterTab=name;tab.setAttribute('aria-controls','character-page-'+name);tab.textContent=name;tabs.append(tab);}
  tabs.onclick=event=>{const tab=event.target.closest('[data-character-tab]');if(tab)this.select(tab.dataset.characterTab);};
  tabs.onkeydown=event=>{const current=pages.indexOf(this.page),next=event.key==='ArrowRight'?(current+1)%pages.length:event.key==='ArrowLeft'?(current+pages.length-1)%pages.length:event.key==='Home'?0:event.key==='End'?pages.length-1:null;if(next===null)return;event.preventDefault();this.select(pages[next]);tabs.querySelector(`[data-character-tab="${pages[next]}"]`).focus();};
  this.dialog.querySelector('[data-character-undo]').onclick=undo;this.dialog.querySelector('[data-character-redo]').onclick=redo;
  this.dialog.querySelector('[data-character-random]').onclick=()=>editPerson('Randomize unlocked character categories',person=>randomizeCharacter(person,this.locked,catalog));
  this.dialog.querySelector('[data-character-reset]').onclick=()=>editPerson('Reset character '+this.page.toLowerCase(),person=>resetCharacterCategory(person,this.baseline,this.page));
  this.dialog.onchange=event=>{if(event.target.matches('[data-character-lock]')){this.locked[this.page]=event.target.checked;this.select(this.page);}else if(event.target.dataset.residentField||event.target.dataset.residentStart)changeField(event);else this.restart();};
  this.dialog.addEventListener('click',startAction);
  this.dialog.querySelector('.dialog-close').onclick=this.dialog.querySelector('[data-character-done]').onclick=()=>this.dialog.close();
  this.dialog.addEventListener('close',()=>{if(this.dialog.open)return;const id=this.id;this.token++;cancelAnimationFrame(this.frame);this.frame=null;this.id=null;this.sheets=null;[...document.querySelectorAll('[data-resident]')].find(el=>el.dataset.resident===id)?.querySelector('[data-open-character]')?.focus({preventScroll:true});});
  this.motion.addEventListener('change',()=>this.restart());document.addEventListener('visibilitychange',()=>this.restart());
 }
 person(){return this.source().find(p=>p.id===this.id);}
 open(id){this.id=id;this.baseline=structuredClone(this.person());this.locked={Identity:true,Appearance:false,Personality:false,Experience:false};this.page='Identity';this.signature=null;this.look=null;this.appearanceKey=null;this.dialog.showModal();this.update();this.dialog.scrollTop=0;this.dialog.querySelector('[data-character-tab="Identity"]').focus();}
 update(){
  if(!this.dialog.open)return;const state=this.history();this.dialog.querySelector('[data-character-undo]').disabled=!state.undo;this.dialog.querySelector('[data-character-redo]').disabled=!state.redo;const person=this.person();if(!person){this.dialog.close();return;}
  const signature=JSON.stringify([person,this.groups().get(person.id)?.Arrival]);
  if(signature!==this.signature){
   const focused=this.dialog.contains(document.activeElement)?document.activeElement.dataset.residentField:null,startFocus=document.activeElement?.dataset.residentStart;
   this.signature=signature;this.fieldHost.dataset.editingResident=person.id;const fields=this.groups().get(person.id);
   this.fieldHost.innerHTML=pages.map(name=>`<div role="tabpanel" id="character-page-${name}" aria-labelledby="character-tab-${name}" data-character-page="${name}">${fields[name]}</div>`).join('');
   const experience=this.fieldHost.querySelector('.creator-experience');if(experience)experience.open=true;
   this.dialog.querySelector('[data-character-name]').textContent=person.name;this.select(this.page);
   if(startFocus)this.fieldHost.querySelector(`[data-resident-start="${startFocus}"]`)?.focus({preventScroll:true});
   if(focused)this.fieldHost.querySelector(`[data-resident-field="${focused}"]`)?.focus({preventScroll:true});
  }
  const appearance=person.appearance??{preset:person.preset,version:person.preset_version},key=JSON.stringify(appearance);
  if(key!==this.appearanceKey){this.appearanceKey=key;this.appearance=appearance;this.look=appearance.preset??'custom';void this.load(appearance);}
  // Identity, routines and history refreshes do not change the selected pose.
  // Leave its existing animation loop running instead of resetting its phase.
  else if(this.frame===null)this.restart();
 }
 select(name){this.page=name;this.dialog.querySelector('.character-choice-actions').hidden=name==='Arrival';this.dialog.querySelector('[data-character-lock]').checked=this.locked[name];this.dialog.querySelector('[data-character-lock-label]').textContent=`Keep ${name.toLowerCase()} when randomizing`;this.dialog.querySelector('[data-character-random]').disabled=Object.values(this.locked).every(Boolean);this.dialog.querySelector('[data-character-random-note]').textContent=Object.values(this.locked).every(Boolean)?'All categories are locked.':`Randomizing: ${Object.keys(characterCategories).filter(page=>!this.locked[page]).join(', ')}. ${this.locked.Identity?'':'Unlocked identity gets a new name and clears pronouns and biography. '}Randomized routines leave outside shifts off.`;const person=this.person();this.dialog.querySelector('[data-character-reset]').disabled=(characterCategories[name]??[]).every(field=>JSON.stringify(person?.[field])===JSON.stringify(this.baseline?.[field]));for(const tab of this.dialog.querySelectorAll('[role=tab]')){const selected=tab.dataset.characterTab===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}for(const panel of this.fieldHost.children)panel.hidden=panel.dataset.characterPage!==name;}
 async load(appearance){
  const token=++this.token;this.sheets=null;cancelAnimationFrame(this.frame);this.canvas.getContext('2d').clearRect(0,0,320,240);this.portrait.getContext('2d').clearRect(0,0,64,72);this.status('Loading character poses…');
  try{
   const sheets=await this.art.appearances.prepare(appearance);if(token!==this.token||!this.dialog.open)return;
   this.sheets=sheets;this.status('Preview only · village time and resident needs stay unchanged.');this.restart();
  }catch(error){if(token===this.token){console.warn('Resident preview could not load.',error);this.status('These character poses could not load. Keep your draft and try again.');}}
 }
 status(text){this.dialog.querySelector('[data-character-preview-status]').textContent=text;}
 restart(){cancelAnimationFrame(this.frame);this.frame=null;this.start=performance.now();if(this.dialog.open&&this.sheets&&!document.hidden)this.draw(this.start);}
 draw(now){
  if(!this.dialog.open||!this.sheets||document.hidden)return;
  const seconds=this.motion.matches?0:(now-this.start)/1000,mode=this.dialog.querySelector('[data-character-pose]').value,facing=Number(this.dialog.querySelector('[data-character-facing]').value),night=Number(this.dialog.querySelector('[data-character-light]').value),scale=this.dialog.querySelector('[data-character-scale]').checked;
  const ctx=this.canvas.getContext('2d');ctx.clearRect(0,0,320,240);ctx.fillStyle=night?'#33423c':'#e0e5cb';ctx.fillRect(0,0,320,240);
  if(scale)paintWorldBuilding(ctx,{key:'home',x:0,y:0},{project:()=>({x:100,y:178}),scale:1,images:this.art.images,night,light:0});
  const x=scale?220:160,width=scale?RESIDENT_WIDTH:160;let y=scale?195:222;
  const animation={layers:sampleResidentClip(mode,seconds,this.sheets.animationProfile),facing,breath:1};
  for(const pose of presentedPoseLayers(animation.layers,this.sheets.interpolation)){const contact=this.sheets.contactForPose?.(pose.sheet,pose.row*4+pose.frame,pose);if(contact)y=Math.min(y,240-4-(256-contact[1])*width/256);}
  paintResidentShadow(ctx,this.sheets,animation,x,y,width,{rx:width*.24,ry:width*.065,opacity:.18});ctx.save();ctx.filter=unlitFilter(night);
  drawResidentAnimation(ctx,this.surface,this.sheets,animation,x,y,width);ctx.restore();
  if(scale){const frame=this.art.appearances.portraitFrame({preset:'bento',version:1});ctx.save();ctx.filter=unlitFilter(night);ctx.drawImage(frame,264-RESIDENT_WIDTH/2,204-RESIDENT_WIDTH*.95,RESIDENT_WIDTH,RESIDENT_WIDTH);ctx.restore();}
  paintResidentPortrait(this.portrait,this.appearance,this.art.appearances,{filter:unlitFilter(night)});
  Object.assign(this.canvas.dataset,{look:this.look,appearance:JSON.stringify(this.appearance),pose:mode,animationProfile:this.sheets.animationProfile??'legacy',frame:String(sampleResidentClip(mode,seconds,this.sheets.animationProfile)[0].frame),scale:String(scale),night:String(night),anchorX:String(x),anchorY:String(y),spriteWidth:String(width)});
  if(!this.motion.matches&&residentClips[mode].fps>0)this.frame=requestAnimationFrame(t=>this.draw(t));
 }
}
