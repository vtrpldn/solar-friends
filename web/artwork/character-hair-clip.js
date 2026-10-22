import {loadCharacterImageSource} from '../character-image-source.js';
import {registeredHairFrame} from './character-single-hair.js';
import {extractRegisteredAtlasPart,composeActivityUnderlay} from '../character-atlas-part.js';
import {residentClips} from '../resident-animation.js';
const labels={breathe:'breathing',walk:'walking',work:'working',sit:'seated / sleeping',look:'looking around',stretch:'stretching',wave:'waving',relax:'relaxing',cook:'cooking',water:'watering',tend:'tending',feed:'feeding'};
// Share animation ownership and duration with gameplay; all four authored atlas
// poses are reviewed even when an animation intentionally skips one of them.
const clips=Object.fromEntries(Object.entries(labels).map(([name,label])=>{const {sheet,row,frames,fps,loop}=residentClips[name];return [name,{sheet,indices:Array.from({length:4},(_,i)=>row*4+i),duration:frames.length/fps,loop:loop===true,label}];}));
export function hairClipProvider(frames,clip){
 const spec=Object.hasOwn(clips,clip)?clips[clip]:null;
 if(!spec||!(frames instanceof Map)||frames.size!==4||spec.indices.some(i=>frames.get(i)?.width!==256||frames.get(i)?.height!==256||typeof frames.get(i)?.getContext!=='function'))throw Error('Provide every registered frame for the supported hair clip.');
 const owned=new Map(frames);return Object.freeze({frameForPose:(sheet,index)=>{if(sheet!==spec.sheet||!owned.has(index))throw Error('Hair artwork is unavailable for this pose.');return owned.get(index);}});
}
export async function installHairClipReview({clip,frames,binding,scene,before}){
 const spec=Object.hasOwn(clips,clip)?clips[clip]:null;if(!spec)throw Error('Unsupported hair review clip.');
 const root='../art/characters/prototype-v1/',registration=await(await fetch(root+`hair-${clip}-v1-registration.json`)).json();
 if(registration.schema!==1||registration.clip!==clip||registration.sheet!==spec.sheet||Object.keys(registration.poses??{}).sort().join(',')!==spec.indices.map(String).sort().join(','))throw Error('Use the registered four-pose hair set.');
 const sources=new Map(),load=async file=>{
  if(!/^(?:hair-curls-(?:single-candidate-v3|(?:base|idle|activities)-(?:[0-9]|1[0-5])-candidate-v[1-6])|hair-seat-base-1[2-5]-candidate-v1)\.png$/.test(file))throw Error('Unsupported review asset.');
  if(!sources.has(file))sources.set(file,await loadCharacterImageSource(root+file));return sources.get(file);
 },composed=new Map(),appearanceFrames=new Map(),activityParts=new Map();for(const index of spec.indices){
  const pose=registration.poses[index],source=await load(pose.file),part=extractRegisteredAtlasPart({...source,registration:{sha256:pose.sha256,size:pose.size,bounds:pose.bounds,sourceRect:pose.sourceRect??[0,0,1254,1254]}});
  const appearance=await registeredHairFrame({body:frames[spec.sheet][index],binding,image:part.frame,sourceHash:source.sourceHash,registration:{schema:1,sheet:spec.sheet,index,size:pose.size,bounds:pose.bounds,partSha256:pose.sha256,body:registration.body,...(pose.foreground!==undefined?{foreground:pose.foreground}:{})}});appearanceFrames.set(index,appearance);
  if(pose.activity!==undefined){const activity=pose.activity;if(clip!=='sit'||activity.kind!=='stool'||activity.file!==`hair-seat-base-${index}-candidate-v1.png`||Object.keys(activity).sort().join(',')!=='bounds,file,kind,sha256,size,sourceRect')throw Error('Unsupported activity part for this pose.');const underlay=extractRegisteredAtlasPart({...await load(activity.file),registration:{sha256:activity.sha256,size:activity.size,bounds:activity.bounds,sourceRect:activity.sourceRect}});activityParts.set(index,underlay);composed.set(index,composeActivityUnderlay(appearance,underlay));}else composed.set(index,appearance);
 }
 const fullProvider=hairClipProvider(composed,clip),appearanceProvider=hairClipProvider(appearanceFrames,clip);let includeActivity=true;
 const provider=Object.freeze({frameForPose:(sheet,index)=>(includeActivity?fullProvider:appearanceProvider).frameForPose(sheet,index)}),section=document.createElement('section');section.id=`${clip}-hair-review`;
 const title=document.createElement('h2');title.textContent=`Short curls · ${spec.label} ${spec.loop?'loop':'animation'}`;const note=document.createElement('p');note.textContent=`Prototype only: four ${spec.label} poses. Scrub key poses and crossfades in both facings, by day and night. Curl volume still needs temporal polish. Other pose groups and full character customization remain unfinished; this is excluded from player choices.${spec.sheet==='activities'?' Hair/body only: activity utensils and grip layers are unfinished.':''}`;
 const label=document.createElement('label');label.textContent=spec.loop?'Loop sample · seconds ':'Animation time · seconds ';const time=document.createElement('input');time.type='number';time.min='0';time.max=String(spec.duration);time.step='.001';time.value='0';time.id=`${clip}-hair-time`;label.append(time);section.append(title,note,label);
 let mode=null;if(clip==='sit'){mode=document.createElement('select');mode.id='sit-hair-mode';mode.append(new Option('Sitting loop','sit'),new Option('Asleep · pose 15','sleep'));const modeLabel=document.createElement('label');modeLabel.textContent='Activity ';modeLabel.append(mode);section.append(modeLabel);const activityLabel=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=true;checkbox.id='sit-activity-visible';activityLabel.append(checkbox,document.createTextNode('Show activity stool'));section.append(activityLabel);checkbox.addEventListener('change',()=>{includeActivity=checkbox.checked;draw();});}
 const grid=document.createElement('div');grid.className='body-review-scenes';const views=[];
 for(const facing of [1,-1])for(const night of [0,1]){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=900;canvas.height=420;caption.textContent=`${facing===1?'Right':'Left'} · ${night?'night':'day'} · ${spec.label}`;figure.append(canvas,caption);grid.append(figure);views.push({canvas,night,facing});}
 const draw=()=>{const seconds=Number(time.value);if(!Number.isFinite(seconds)||seconds<0||seconds>spec.duration)return;for(const {canvas,night,facing}of views)scene(canvas,night,{hairProvider:provider,hairMode:mode?.value??clip,hairSeconds:seconds,facingOverride:facing});};
 time.addEventListener('input',draw);mode?.addEventListener('change',draw);section.append(grid);before.before(section);draw();return {provider,registration,frames:composed,appearanceFrames,activityParts};
}
