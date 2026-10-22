import {validateBodyMaterials,defaultBodyMaterials,bodyMaterialPalettes} from '../character-materials.js';
import {residentClips} from '../resident-animation.js';
// Review-only until parts, equipment and native recipes pass the release gates.
export function createComposedAppearanceReview({reviews,materials,maxClips=12}){
 if(!Number.isInteger(maxClips)||maxClips<1||maxClips>24)throw Error('Choose a bounded appearance review cache.');
 const owned=new Map(Object.entries(reviews)),cache=new Map();let epoch=0;
 return {
  async provider(clip,recipe=defaultBodyMaterials){
   const keyClip=clip==='sleep'?'sit':clip,review=owned.get(keyClip);
   if(!review)throw Error('This appearance animation is unavailable.');
   const checked=validateBodyMaterials(recipe),key=keyClip+':'+JSON.stringify(checked);
   if(cache.has(key)){const provider=cache.get(key);cache.delete(key);cache.set(key,provider);return provider;}
   const started=epoch,provider=await review.composeMaterials(materials.provider(checked));
   if(started===epoch){cache.set(key,provider);while(cache.size>maxClips)cache.delete(cache.keys().next().value);}
   return provider;
  },
  clear(){epoch++;cache.clear();},
  cacheInfo:()=>({clips:cache.size,frames:cache.size*4,maximumFrames:maxClips*4,rgbaBytes:cache.size*4*256*256*4}),
 };
}
export async function installComposedAppearanceReview({reviews,materials,scene,before}){
 const model=createComposedAppearanceReview({reviews,materials}),section=document.createElement('section');section.id='composed-appearance-review';
 const title=document.createElement('h2');title.textContent='Combined appearance · all animations';const note=document.createElement('p');note.textContent='Draft body colours and short curls share one pose. Foreground hands and activity stools retain their layer order. Equipment, other appearance parts and temporal polish remain unfinished; excluded from player choices.';section.append(title,note);
 const controls={};for(const [name,palettes]of Object.entries(bodyMaterialPalettes)){const label=document.createElement('label'),select=document.createElement('select');label.textContent=name+' ';select.id='composed-appearance-'+name;select.append(...Object.keys(palettes).filter(key=>key!=='reference').map(key=>new Option(key,key)));select.value=defaultBodyMaterials[name];label.append(select);section.append(label);controls[name]=select;}
 const clip=document.createElement('select');clip.id='composed-appearance-clip';clip.append(...Object.keys(residentClips).map(key=>new Option(key,key)));clip.value='breathe';const clipLabel=document.createElement('label');clipLabel.textContent='Animation ';clipLabel.append(clip);section.append(clipLabel);
 const time=document.createElement('input');time.id='composed-appearance-time';time.type='number';time.min='0';time.step='.001';time.value='0';const timeLabel=document.createElement('label');timeLabel.textContent='Seconds ';timeLabel.append(time);section.append(timeLabel);
 const status=document.createElement('p');status.id='composed-appearance-status';status.setAttribute('role','status');section.append(status);const grid=document.createElement('div');grid.className='body-review-scenes';section.append(grid);const views=[];
 for(const facing of [1,-1])for(const night of [0,1]){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=900;canvas.height=420;caption.textContent=`${facing===1?'Right':'Left'} · ${night?'night':'day'}`;figure.append(canvas,caption);grid.append(figure);views.push({canvas,facing,night});}
 let revision=0;
 const draw=async()=>{const own=++revision,mode=clip.value,spec=residentClips[mode],duration=spec.fps?spec.frames.length/spec.fps:0;time.max=String(duration);const seconds=Math.min(duration,Math.max(0,Number(time.value)||0));time.value=String(seconds);status.textContent='Composing…';section.dataset.ready='false';try{const recipe=Object.fromEntries(Object.entries(controls).map(([key,select])=>[key,select.value])),provider=await model.provider(mode,recipe);if(own!==revision)return;for(const {canvas,facing,night}of views)scene(canvas,night,{hairProvider:provider,hairMode:mode,hairSeconds:seconds,facingOverride:facing});status.textContent='Draft appearance · '+model.cacheInfo().frames+' cached poses';section.dataset.ready='true';}catch(error){if(own===revision){status.textContent=error.message;section.dataset.ready='error';}}};
 for(const select of Object.values(controls))select.addEventListener('change',draw);clip.addEventListener('change',draw);time.addEventListener('input',draw);before.before(section);await draw();return {model,draw};
}
