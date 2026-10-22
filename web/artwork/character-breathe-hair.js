import {registeredHairFrame} from './character-single-hair.js';
export function breatheHairProvider(frames){
 if(!(frames instanceof Map)||frames.size!==4||[8,9,10,11].some(i=>frames.get(i)?.width!==256||frames.get(i)?.height!==256||typeof frames.get(i)?.getContext!=='function'))throw Error('Provide all four registered breathing frames.');
 const owned=new Map(frames);
 return Object.freeze({frameForPose:(sheet,index)=>{
  if(sheet!=='base'||!owned.has(index))throw Error('Hair artwork is available only for the four breathing poses.');
  return owned.get(index);
 }});
}
export async function installBreatheHairReview({frames,binding,scene,before}){
 const root='../art/characters/prototype-v1/',registration=await(await fetch(root+'hair-breathe-v1-registration.json')).json();
 if(registration.schema!==1||Object.keys(registration.poses??{}).sort().join(',')!=='10,11,8,9')throw Error('Use the registered four-pose breathing set.');
 const composed=new Map();
 for(const index of [8,9,10,11]){
  const pose=registration.poses[index];if(!/^hair-curls-(?:single-candidate-v3|base-(?:9|10|11)-candidate-v1)\.png$/.test(pose.file))throw Error('Unsupported review asset.');
  const bytes=await(await fetch(root+pose.file)).arrayBuffer(),sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join(''),image=new Image();image.src=root+pose.file;await image.decode();
  composed.set(index,await registeredHairFrame({body:frames.base[index],binding,image,sourceHash,registration:{schema:1,sheet:'base',index,size:pose.size,partSha256:pose.sha256,body:registration.body}}));
 }
 const provider=breatheHairProvider(composed),section=document.createElement('section');section.id='breathe-hair-review';
 const title=document.createElement('h2');title.textContent='Short curls · breathing loop';const note=document.createElement('p');note.textContent='Prototype only: four standing breathing poses. Scrub key poses and crossfades in both facings, by day and night. Walking, work, seated and other gestures have no compatible hair yet; this is excluded from player choices.';
 const label=document.createElement('label');label.textContent='Loop sample · seconds ';const time=document.createElement('input');time.type='number';time.min='0';time.max='5';time.step='.01';time.value='0';time.id='breathe-hair-time';label.append(time);section.append(title,note,label);
 const grid=document.createElement('div');grid.className='body-review-scenes';const views=[];
 for(const facing of [1,-1])for(const night of [0,1]){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=900;canvas.height=420;caption.textContent=`${facing===1?'Right':'Left'} · ${night?'night':'day'} · breathing`;figure.append(canvas,caption);grid.append(figure);views.push({canvas,night,facing});}
 const draw=()=>{const seconds=Number(time.value);if(!Number.isFinite(seconds)||seconds<0||seconds>5)return;for(const {canvas,night,facing}of views)scene(canvas,night,{hairProvider:provider,hairSeconds:seconds,facingOverride:facing});};
 time.addEventListener('input',draw);section.append(grid);before.before(section);draw();return {provider,registration,frames:composed};
}
