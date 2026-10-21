import {residentLookIndex} from './resident-look.js';
import {preparedFrames} from './sprite-frames.js';
export function installResidentIdentity({images,catalog,game,snapshot,changed}){
 const dialog=document.createElement('dialog');dialog.className='resident-identity-dialog';dialog.setAttribute('aria-labelledby','resident-identity-title');
 dialog.innerHTML='<form><h2 id="resident-identity-title">A familiar face</h2><canvas width="192" height="224" aria-label="Resident appearance preview"></canvas><label>Name<input name="resident-name" maxlength="80" required></label><label>Appearance<select name="resident-look"></select></label><p>A change of look for the same neighbour.</p><p role="status"></p><div class="resident-identity-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save changes</button></div></form>';
 document.body.append(dialog);const form=dialog.querySelector('form'),name=form.elements.namedItem('resident-name'),look=form.elements.namedItem('resident-look'),canvas=dialog.querySelector('canvas'),status=dialog.querySelector('[role=status]');
 for(const item of catalog)look.add(new Option(item.name,item.key));let id=null,frame=null,start=0;
 function draw(now=0){
  const index=residentLookIndex({appearance:{preset:look.value,version:1}}),motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pose=preparedFrames(images[index],{referenceRow:2})?.[8+(motion?Math.floor(Math.max(0,now-start)/160)%4:0)];
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,192,224);canvas.dataset.look=look.value;
  if(pose){ctx.fillStyle='rgba(60,74,42,.16)';ctx.beginPath();ctx.ellipse(96,198,22,5,0,0,Math.PI*2);ctx.fill();const size=Math.min(192/pose.width,208/pose.height);ctx.drawImage(pose,(192-pose.width*size)/2,208-pose.height*size,pose.width*size,pose.height*size);}
  if(dialog.open&&motion)frame=requestAnimationFrame(draw);
 }
 look.onchange=()=>{cancelAnimationFrame(frame);start=performance.now();draw(start);};dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);frame=null;});
 form.onsubmit=event=>{event.preventDefault();if(!game().change_resident_identity(id,name.value,look.value,1)){status.textContent='Choose an available look and a name of 1–80 characters.';return;}dialog.close();changed(id);};
 return {open(personId){const person=snapshot().residents.find(p=>p.id===personId);if(!person)return;id=personId;name.value=person.name;look.value=person.appearance.preset;status.textContent='';dialog.showModal();start=performance.now();draw(start);name.focus();}};
}
