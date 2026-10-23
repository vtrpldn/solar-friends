import {createAppearanceCache} from '../appearance-cache.js';
import {defaultBodyMaterials,validateBodyMaterials} from '../character-materials.js';
import {loadCharacterImageSource} from '../character-image-source.js';
import {composeActivityUnderlay} from '../character-atlas-part.js';
import {canonical} from '../editor/journal.js';
import {residentClips} from '../resident-animation.js';
import {registeredHairFrame} from './character-single-hair.js';
import {installAppearanceControls} from './character-composed-review.js';
// A partial art review has its own explicit recipe, never a saved resident look.
export function sidePartReviewRecipe(materials=defaultBodyMaterials){return {reviewSchema:1,body:'neutral-v1',hair:'side-part-v1',materials:validateBodyMaterials(materials)};}
export async function installSidePartReview({frames,binding,materials,seated,scene,before}){
 const root='/art/characters/prototype-v1/',response=await fetch(root+'hair-sidepart-base-v1-registration.json');if(!response.ok)throw Error('Cannot load the partial hairstyle review.');
 const registration=await response.json(),clipKeys=['breathe','walk','work','sit','sleep'];if(registration.schema!==1||registration.sheet!=='base'||canonical(registration.clips)!==canonical(clipKeys)||Object.keys(registration.poses??{}).sort().join(',')!==Array.from({length:16},(_,i)=>String(i)).sort().join(','))throw Error('Provide all sixteen registered side-part base poses.');
 const sources=new Map(),activityParts=new Map();for(let index=0;index<16;index++){
  const pose=registration.poses[index];if(!new RegExp(`^hair-sidepart-base-${index}-candidate-v[1-9]\\.png$`).test(pose.file??'')||pose.sheet!=='base'||pose.index!==index)throw Error('Choose the bundled side-part pose.');sources.set(index,await loadCharacterImageSource(root+pose.file));
  if(index>=12){const part=seated?.activityParts.get(index);if(!part||canonical(pose.activity)!==canonical(seated.registration.poses[index].activity))throw Error('Review the shared stool registration before composing this hairstyle.');activityParts.set(index,part);}
  else if(pose.activity!==undefined)throw Error('Only seated poses use an activity stool.');
 }
 const cache=createAppearanceCache({maxEntries:6,maxConcurrent:2,maxQueued:24,compose:async({clip,recipe})=>{
  const painted=materials.provider(recipe.materials),composed=new Map(),spec=residentClips[clip];for(let index=spec.row*4;index<spec.row*4+4;index++){
   const source=sources.get(index);try{
    const appearance=await registeredHairFrame({body:frames.base[index],binding,registration:{...registration.poses[index],body:registration.body},image:source.image,sourceHash:source.sourceHash,appearanceBody:painted.frameForPose('base',index)});
    composed.set(index,activityParts.has(index)?composeActivityUnderlay(appearance,activityParts.get(index)):appearance);
   }catch(error){throw Error('Side-part '+clip+' pose '+index+': '+error.message,{cause:error});}
  }
  return {interpolation:'keyframes',frameForPose(sheet,index){if(sheet!=='base'||!composed.has(index))throw Error('The partial side-part hairstyle has no artwork for this pose.');return composed.get(index);}};
 }});
 const model={provider(clip,recipe=sidePartReviewRecipe()){
  if(!clipKeys.includes(clip))return Promise.reject(Error('This hairstyle has no painted artwork for that activity yet.'));
  let checked;try{if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||Object.keys(recipe).sort().join(',')!=='body,hair,materials,reviewSchema'||recipe.reviewSchema!==1||recipe.body!=='neutral-v1'||recipe.hair!=='side-part-v1')throw Error('Choose the partial side-part review recipe.');checked=sidePartReviewRecipe(recipe.materials);}catch(error){return Promise.reject(error);}
  const keyClip=clip==='sleep'?'sit':clip;return cache.get(keyClip+':'+JSON.stringify(checked),{clip:keyClip,recipe:checked});
 },clear:()=>cache.clear(),cacheInfo:()=>{const info=cache.info();return {...info,frames:info.entries*4,maximumFrames:24,rgbaBytes:info.entries*4*256*256*4};}};
 const controls=await installAppearanceControls({model,scene,before,prefix:'sidepart-appearance',makeRecipe:sidePartReviewRecipe,clipKeys,titleText:'Side part · base animations prototype',noteText:'Sixteen painted hair layers cover breathing, walking, working, sitting and sleeping, with shared foreground hands and activity stools. The other 32 poses are unpainted. This incomplete hairstyle is excluded from player recipes, saves and character choices; style, contact and temporal consistency remain under review.'});
 return {...controls,registration,sources,activityParts};
}
