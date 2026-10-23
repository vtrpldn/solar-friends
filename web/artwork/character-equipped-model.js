import {createAppearanceCache} from '../appearance-cache.js';
import {prototypeAppearanceRecipe,validatePrototypeAppearanceRecipe} from '../character-appearance-recipe.js';
import {registeredEquipmentFrame} from '../character-equipment.js';
import {residentClips} from '../resident-animation.js';
// Review-only. One immutable source set per model; recipes never choose files.
// Equipment is activity-owned and is composed after appearance, before hands.
export function createEquippedAppearanceReview({appearance,materials,frames,binding,reviews,makeRecipe=prototypeAppearanceRecipe,validateRecipe=validatePrototypeAppearanceRecipe,maxClips=12,maxConcurrent=2,maxQueued=48}){
 const activities=new Map();
 for(const clip of ['cook','water','tend','feed']){
  const review=reviews?.[clip],spec=residentClips[clip],indices=[...new Set(spec.frames)].map(frame=>spec.row*4+frame);
  if(!review?.poses||indices.some(index=>!review.poses.has(index))||review.poses.size!==indices.length)throw Error('Provide every registered equipment pose for each activity.');
  activities.set(clip,new Map(indices.map(index=>{
   const pose=review.poses.get(index),registration=structuredClone(pose.registration),equipment={...pose.equipment,parts:pose.equipment.parts?.map(part=>({...part}))};
   if(registration.sheet!==spec.sheet||registration.index!==index)throw Error('Equipment belongs to another activity pose.');
   return [index,{registration,equipment}];
  })));
 }
 const cache=createAppearanceCache({maxEntries:maxClips,maxConcurrent,maxQueued,compose:async({clip,recipe})=>{
  const hair=await appearance.provider(clip,recipe),painted=materials.provider(recipe.materials),composed=new Map(),recovery=new Map();
  for(const [index,{registration,equipment}]of activities.get(clip)){
   const args={body:frames.activities[index],binding,appearanceBody:painted.frameForPose('activities',index),appearanceFrame:hair.frameForPose('activities',index),equipment,registration,sheet:'activities',index};
   composed.set(index,await registeredEquipmentFrame(args));
   if(clip==='feed'&&[13,14].includes(index)){
    const keep=registration.parts.map((part,i)=>!part.id.startsWith('grain-')?i:-1).filter(i=>i>=0);
    recovery.set(index,await registeredEquipmentFrame({...args,registration:{...registration,parts:keep.map(i=>registration.parts[i])},equipment:{...equipment,parts:keep.map(i=>equipment.parts[i])}}));
   }
  }
  return {interpolation:'keyframes',frameForPose(sheet,index,pose){
   if(sheet!=='activities'||!composed.has(index))throw Error('This appearance activity pose is unavailable.');
   return clip==='feed'&&pose?.sequenceIndex>=4?recovery.get(index)??composed.get(index):composed.get(index);
  }};
 }});
 return {
  provider(clip,recipe=makeRecipe()){
   let checked;try{checked=validateRecipe(recipe);}catch(error){return Promise.reject(error);}
   if(!Object.hasOwn(residentClips,clip))return Promise.reject(Error('This appearance animation is unavailable.'));
   if(!activities.has(clip))return appearance.provider(clip,checked);
   return cache.get(clip+':'+JSON.stringify(checked),{clip,recipe:checked});
  },
  clear:()=>cache.clear(),
  // Six includes the two empty-handed feeding recovery states. This is an
  // upper bound for this model only; base appearance/material caches are separate.
  cacheInfo:()=>{const info=cache.info();return {...info,clips:info.entries,frames:info.entries*6,frameCountIsUpperBound:true,cacheLabel:'equipment poses',maximumFrames:maxClips*6,rgbaBytes:info.entries*6*256*256*4};},
 };
}
