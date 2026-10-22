import {registeredHairFrame} from './character-single-hair.js';
const clips={breathe:{indices:[8,9,10,11],duration:5,label:'breathing'},walk:{indices:[0,1,2,3],duration:.5,label:'walking'},work:{indices:[4,5,6,7],duration:.8,label:'working'}};
export function hairClipProvider(frames,clip){
 const spec=Object.hasOwn(clips,clip)?clips[clip]:null;
 if(!spec||!(frames instanceof Map)||frames.size!==4||spec.indices.some(i=>frames.get(i)?.width!==256||frames.get(i)?.height!==256||typeof frames.get(i)?.getContext!=='function'))throw Error('Provide every registered frame for the supported hair clip.');
 const owned=new Map(frames);return Object.freeze({frameForPose:(sheet,index)=>{if(sheet!=='base'||!owned.has(index))throw Error('Hair artwork is unavailable for this pose.');return owned.get(index);}});
}
export async function installHairClipReview({clip,frames,binding,scene,before}){
 const spec=Object.hasOwn(clips,clip)?clips[clip]:null;if(!spec)throw Error('Unsupported hair review clip.');
 const root='../art/characters/prototype-v1/',registration=await(await fetch(root+`hair-${clip}-v1-registration.json`)).json();
 if(registration.schema!==1||registration.clip!==clip||registration.sheet!=='base'||Object.keys(registration.poses??{}).sort().join(',')!==spec.indices.map(String).sort().join(','))throw Error('Use the registered four-pose hair set.');
 const composed=new Map();for(const index of spec.indices){
  const pose=registration.poses[index];if(!/^hair-curls-(?:single-candidate-v3|base-(?:[0-9]|10|11)-candidate-v[1-6])\.png$/.test(pose.file))throw Error('Unsupported review asset.');
  const bytes=await(await fetch(root+pose.file)).arrayBuffer(),sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join(''),image=new Image();image.src=root+pose.file;await image.decode();
  composed.set(index,await registeredHairFrame({body:frames.base[index],binding,image,sourceHash,registration:{schema:1,sheet:'base',index,size:pose.size,bounds:pose.bounds,partSha256:pose.sha256,body:registration.body,...(pose.foreground!==undefined?{foreground:pose.foreground}:{})}}));
 }
 const provider=hairClipProvider(composed,clip),section=document.createElement('section');section.id=`${clip}-hair-review`;
 const title=document.createElement('h2');title.textContent=`Short curls · ${spec.label} loop`;const note=document.createElement('p');note.textContent=`Prototype only: four ${spec.label} poses. Scrub key poses and crossfades in both facings, by day and night. Curl volume still needs temporal polish. Other pose groups and full character customization remain unfinished; this is excluded from player choices.`;
 const label=document.createElement('label');label.textContent='Loop sample · seconds ';const time=document.createElement('input');time.type='number';time.min='0';time.max=String(spec.duration);time.step='.001';time.value='0';time.id=`${clip}-hair-time`;label.append(time);section.append(title,note,label);
 const grid=document.createElement('div');grid.className='body-review-scenes';const views=[];
 for(const facing of [1,-1])for(const night of [0,1]){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=900;canvas.height=420;caption.textContent=`${facing===1?'Right':'Left'} · ${night?'night':'day'} · ${spec.label}`;figure.append(canvas,caption);grid.append(figure);views.push({canvas,night,facing});}
 const draw=()=>{const seconds=Number(time.value);if(!Number.isFinite(seconds)||seconds<0||seconds>spec.duration)return;for(const {canvas,night,facing}of views)scene(canvas,night,{hairProvider:provider,hairMode:clip,hairSeconds:seconds,facingOverride:facing});};
 time.addEventListener('input',draw);section.append(grid);before.before(section);draw();return {provider,registration,frames:composed};
}
