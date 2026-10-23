import {sampleResidentClip,drawResidentAnimation,presentedPoseLayers} from './resident-animation.js';
import {FRAME_ANCHOR} from './sprite-frames.js';
import {appearanceFields,changeAppearanceField} from './resident-appearance-fields.js';
export function installResidentIdentity({appearances,catalog,game,snapshot,changed}){
 const dialog=document.createElement('dialog');dialog.className='resident-identity-dialog';dialog.setAttribute('aria-labelledby','resident-identity-title');
 dialog.innerHTML='<form><h2 id="resident-identity-title">A familiar face</h2><canvas width="192" height="224" aria-label="Resident appearance preview"></canvas><label>Name<input name="resident-name" maxlength="80" required></label><div data-identity-appearance></div><p>A change of look for the same neighbour.</p><p role="status"></p><div class="resident-identity-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save changes</button></div></form>';
 document.body.append(dialog);const form=dialog.querySelector('form'),name=form.elements.namedItem('resident-name'),host=dialog.querySelector('[data-identity-appearance]'),canvas=dialog.querySelector('canvas'),status=dialog.querySelector('[role=status]'),submit=form.querySelector('[type=submit]');let id=null,frame=null,start=0,appearance=null,revision=0,ready=false;
 function fields(focus){host.innerHTML=appearanceFields(appearance,catalog);host.querySelector('[data-resident-field=appearance]').name='resident-look';if(focus)host.querySelector(`[data-resident-field="${focus}"]`)?.focus();}
 const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
 const surface=document.createElement('canvas');surface.width=surface.height=256;
 function draw(now=0){
  const motion=!motionPreference.matches,provider=appearances.provider(appearance),seconds=motion?Math.max(0,now-start)/1000:0,layers=sampleResidentClip('breathe',seconds,provider.animationProfile);
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,192,224);canvas.dataset.look=appearance.preset??'custom';canvas.dataset.appearance=JSON.stringify(appearance);canvas.dataset.ready='true';
  ctx.fillStyle='rgba(60,74,42,.16)';ctx.beginPath();ctx.ellipse(96,198,22,5,0,0,Math.PI*2);ctx.fill();drawResidentAnimation(ctx,surface,provider,{layers,facing:1,breath:1},96,208-192*(1-FRAME_ANCHOR),192);canvas.dataset.frame=String(presentedPoseLayers(layers,provider.interpolation)[0].frame);canvas.dataset.animationProfile=provider.animationProfile??'legacy';
  if(dialog.open&&motion)frame=requestAnimationFrame(draw);
 }
 motionPreference.addEventListener('change',()=>{if(dialog.open&&ready){cancelAnimationFrame(frame);start=performance.now();draw(start);}});
 async function prepare(){const own=++revision;cancelAnimationFrame(frame);ready=false;submit.disabled=true;canvas.dataset.ready='false';canvas.getContext('2d').clearRect(0,0,192,224);status.textContent='Preparing this appearance…';try{await appearances.prepare(appearance,{sheets:['base']});if(own!==revision||!dialog.open)return;ready=true;submit.disabled=false;status.textContent='';start=performance.now();draw(start);}catch(error){if(own===revision&&dialog.open)status.textContent=error.message;}}
 host.onchange=event=>{const field=event.target.dataset.residentField;if(!field)return;appearance=changeAppearanceField(appearance,field,event.target.value);fields(field);void prepare();};
 dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{revision++;cancelAnimationFrame(frame);frame=null;});
 form.onsubmit=event=>{event.preventDefault();if(!ready)return;if(!game().change_resident_appearance(id,name.value,JSON.stringify(appearance))){status.textContent='Choose an available look and a name of 1–80 characters.';return;}dialog.close();changed(id);};
 return {open(personId){const person=snapshot().residents.find(p=>p.id===personId);if(!person)return;id=personId;appearance=structuredClone(person.appearance);name.value=person.name;fields();status.textContent='';dialog.showModal();void prepare();name.focus();}};
}
