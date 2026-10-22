import {createAppearanceCache} from '../appearance-cache.js';
import {unlitFilter} from '../power.js';
import {prototypeAppearanceRecipe,validatePrototypeAppearanceRecipe} from '../character-appearance-recipe.js';
import {paintPreparedResidentPortrait} from '../resident-portrait.js';
import {bodyMaterialPalettes} from '../character-materials.js';
import {residentClips} from '../resident-animation.js';
// Review-only until parts, equipment and native recipes pass the release gates.
export function createComposedAppearanceReview({reviews,materials,maxClips=12,maxConcurrent=2,maxQueued=48}){
 const owned=new Map(Object.entries(reviews)),cache=createAppearanceCache({maxEntries:maxClips,maxConcurrent,maxQueued,compose:async({review,checked})=>{const provider=await review.composeMaterials(materials.provider(checked.materials));return {interpolation:'keyframes',frameForPose:(sheet,index)=>provider.frameForPose(sheet,index)};}});
 return {
  provider(clip,recipe=prototypeAppearanceRecipe()){
   const keyClip=clip==='sleep'?'sit':clip,review=owned.get(keyClip);
   if(!review)return Promise.reject(Error('This appearance animation is unavailable.'));
   let checked;try{checked=validatePrototypeAppearanceRecipe(recipe);}catch(error){return Promise.reject(error);}
   return cache.get(keyClip+':'+JSON.stringify(checked),{review,checked});
  },
  clear:()=>cache.clear(),
  cacheInfo:()=>{const info=cache.info();return {...info,clips:info.entries,frames:info.entries*4,maximumFrames:maxClips*4,rgbaBytes:info.entries*4*256*256*4};},
 };
}
export async function installComposedAppearanceReview({reviews,materials,scene,before}){
 return installAppearanceControls({model:createComposedAppearanceReview({reviews,materials}),scene,before});
}
export async function installAppearanceControls({model,scene,before,prefix='composed-appearance',makeRecipe=prototypeAppearanceRecipe,clipKeys=Object.keys(residentClips),titleText='Combined appearance · all animations',noteText='Draft body colours and short curls share one pose. Foreground hands and activity stools retain their layer order. Equipment, other appearance parts and temporal polish remain unfinished; excluded from player choices.'}){
 const section=document.createElement('section');section.id=prefix+'-review';
 const title=document.createElement('h2');title.textContent=titleText;const note=document.createElement('p');note.textContent=noteText;section.append(title,note);
 const controls={};for(const [name,palettes]of Object.entries(bodyMaterialPalettes)){const label=document.createElement('label'),select=document.createElement('select');label.textContent=name+' ';select.id=prefix+'-'+name;select.append(...Object.keys(palettes).filter(key=>key!=='reference').map(key=>new Option(key,key)));select.value=makeRecipe().materials[name];label.append(select);section.append(label);controls[name]=select;}
 const clip=document.createElement('select');clip.id=prefix+'-clip';clip.append(...clipKeys.map(key=>new Option(key,key)));clip.value='breathe';const clipLabel=document.createElement('label');clipLabel.textContent='Animation ';clipLabel.append(clip);section.append(clipLabel);
 const time=document.createElement('input');time.id=prefix+'-time';time.type='number';time.min='0';time.step='.001';time.value='0';const timeLabel=document.createElement('label');timeLabel.textContent='Seconds ';timeLabel.append(time);section.append(timeLabel);
 const play=document.createElement('button');play.id=prefix+'-play';play.type='button';play.textContent='Play animation';play.setAttribute('aria-pressed','false');section.append(play);
 const status=document.createElement('p');status.id=prefix+'-status';status.setAttribute('role','status');section.append(status);const grid=document.createElement('div');grid.className='body-review-scenes';section.append(grid);const views=[];
 for(const facing of [1,-1])for(const night of [0,1]){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption'),portrait=document.createElement('canvas');portrait.width=128;portrait.height=152;portrait.className='composed-appearance-portrait';portrait.setAttribute('aria-label','Matching portrait');canvas.width=900;canvas.height=420;caption.textContent=`${facing===1?'Right':'Left'} · ${night?'night':'day'}`;figure.append(canvas,portrait,caption);grid.append(figure);views.push({canvas,portrait,facing,night});}
 let revision=0;
 const draw=async()=>{const own=++revision,mode=clip.value,spec=residentClips[mode],duration=spec.fps?spec.frames.length/spec.fps:0;time.max=String(duration);play.disabled=duration===0;const seconds=Math.min(duration,Math.max(0,Number(time.value)||0));time.value=String(seconds);status.textContent='Composing…';section.dataset.ready='false';try{const recipe=makeRecipe(Object.fromEntries(Object.entries(controls).map(([key,select])=>[key,select.value]))),[provider,portraitProvider]=await Promise.all([model.provider(mode,recipe),model.provider('breathe',recipe)]);if(own!==revision)return;for(const {canvas,portrait,facing,night}of views){scene(canvas,night,{hairProvider:provider,hairMode:mode,hairSeconds:seconds,facingOverride:facing});paintPreparedResidentPortrait(portrait,portraitProvider.frameForPose('base',8),{filter:unlitFilter(night)});}section.dataset.recipe=JSON.stringify(recipe);const cached=model.cacheInfo();status.textContent='Draft appearance · '+(cached.frameCountIsUpperBound?'up to ':'')+cached.frames+' cached '+(cached.cacheLabel??'poses');section.dataset.ready='true';}catch(error){if(own===revision){status.textContent=error.message;section.dataset.ready='error';}}};
 let request=null,started=0,last=0;
 function stop(){if(request!==null)cancelAnimationFrame(request);request=null;play.textContent='Play animation';play.setAttribute('aria-pressed','false');}
 function step(now){const duration=Number(time.max),seconds=Math.min(duration,(now-started)/1000);if(now-last>=1000/24||seconds===duration){time.value=String(seconds);draw();last=now;}if(seconds<duration)request=requestAnimationFrame(step);else stop();}
 play.onclick=()=>{if(request!==null){stop();return;}time.value='0';draw();started=performance.now();last=started;play.textContent='Pause animation';play.setAttribute('aria-pressed','true');request=requestAnimationFrame(step);};
 const changed=()=>{stop();return draw();};for(const select of Object.values(controls))select.addEventListener('change',changed);clip.addEventListener('change',changed);time.addEventListener('input',changed);
 window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});before.before(section);await draw();return {model,draw};
}
