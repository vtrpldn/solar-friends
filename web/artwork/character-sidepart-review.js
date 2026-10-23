import {createAppearanceCache} from '../appearance-cache.js';
import {defaultBodyMaterials,validateBodyMaterials} from '../character-materials.js';
import {loadCharacterImageSource} from '../character-image-source.js';
import {composeActivityUnderlay} from '../character-atlas-part.js';
import {canonical} from '../editor/journal.js';
import {residentClips} from '../resident-animation.js';
import {registeredHairFrame} from './character-single-hair.js';
import {installAppearanceControls} from './character-composed-review.js';
// Art review has its own explicit recipe, never a saved resident look.
export function sidePartReviewRecipe(materials=defaultBodyMaterials){return {reviewSchema:1,body:'neutral-v1',hair:'side-part-v1',materials:validateBodyMaterials(materials)};}
export function validateSidePartReviewRecipe(recipe){
 if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||Object.keys(recipe).sort().join(',')!=='body,hair,materials,reviewSchema'||recipe.reviewSchema!==1||recipe.body!=='neutral-v1'||recipe.hair!=='side-part-v1')throw Error('Choose the side-part review recipe.');
 return sidePartReviewRecipe(recipe.materials);
}
export async function installSidePartReview({frames,binding,materials,seated,scene,before}){
 const root='/art/characters/prototype-v1/',response=await fetch(root+'hair-sidepart-all-v1-registration.json');if(!response.ok)throw Error('Cannot load the hairstyle review.');
 const registration=await response.json(),sheets=['base','idle','activities'],clipKeys=['breathe','walk','work','sit','sleep','look','stretch','wave','relax','cook','water','tend','feed'];
 if(registration.schema!==2||canonical(registration.sheets)!==canonical(sheets)||canonical(registration.clips)!==canonical(clipKeys)||Object.keys(registration.poses??{}).sort().join(',')!=='activities,base,idle'||sheets.some(sheet=>Object.keys(registration.poses[sheet]??{}).sort().join(',')!==Array.from({length:16},(_,i)=>String(i)).sort().join(',')))throw Error('Provide all forty-eight registered side-part poses.');
 const sources=new Map(),activityParts=new Map(),files=new Map(),load=file=>{if(!files.has(file))files.set(file,loadCharacterImageSource(root+file));return files.get(file);};
 for(const sheet of sheets)for(let index=0;index<16;index++){
  const pose=registration.poses[sheet][index],key=sheet+':'+index;if(!/^hair-sidepart-(?:base|idle|activities)-(?:[0-9]|1[0-5])-candidate-v[1-9]\.png$/.test(pose.file??'')||pose.sheet!==sheet||pose.index!==index)throw Error('Choose the explicitly registered bundled side-part pose.');sources.set(key,await load(pose.file));
  if(sheet==='base'&&index>=12){const part=seated?.activityParts.get(index);if(!part||canonical(pose.activity)!==canonical(seated.registration.poses[index].activity))throw Error('Review the shared stool registration before composing this hairstyle.');activityParts.set(key,part);}
  else if(pose.activity!==undefined)throw Error('Only seated poses use an activity stool.');
 }
 const cache=createAppearanceCache({maxEntries:6,maxConcurrent:2,maxQueued:24,compose:async({clip,recipe})=>{
  const painted=materials.provider(recipe.materials),composed=new Map(),spec=residentClips[clip],sheet=spec.sheet;for(let index=spec.row*4;index<spec.row*4+4;index++){
   const key=sheet+':'+index,source=sources.get(key);try{
    const appearance=await registeredHairFrame({body:frames[sheet][index],binding,registration:{...registration.poses[sheet][index],body:registration.body},image:source.image,sourceHash:source.sourceHash,appearanceBody:painted.frameForPose(sheet,index)});
    composed.set(index,activityParts.has(key)?composeActivityUnderlay(appearance,activityParts.get(key)):appearance);
   }catch(error){throw Error('Side-part '+clip+' pose '+index+': '+error.message,{cause:error});}
  }
  return {interpolation:'keyframes',animationProfile:'neutral-v1',frameForPose(requestedSheet,index){if(requestedSheet!==sheet||!composed.has(index))throw Error('The partial side-part hairstyle has no artwork for this pose.');return composed.get(index);}};
 }});
 const model={provider(clip,recipe=sidePartReviewRecipe()){
  if(!clipKeys.includes(clip))return Promise.reject(Error('This hairstyle has no painted artwork for that activity yet.'));
  let checked;try{checked=validateSidePartReviewRecipe(recipe);}catch(error){return Promise.reject(error);}
  const keyClip=clip==='sleep'?'sit':clip;return cache.get(keyClip+':'+JSON.stringify(checked),{clip:keyClip,recipe:checked});
 },clear:()=>cache.clear(),cacheInfo:()=>{const info=cache.info();return {...info,frames:info.entries*4,maximumFrames:24,rgbaBytes:info.entries*4*256*256*4};}};
 const controls=await installAppearanceControls({model,scene,before,prefix:'sidepart-appearance',makeRecipe:sidePartReviewRecipe,clipKeys,titleText:'Side part · all poses prototype',noteText:'Forty-eight explicitly registered poses share painted caps where compatible, original foreground hands and activity stools. The initial custom-look set uses these same sources through a separate native part recipe. This inspection recipe stays outside player saves; style, contact and temporal consistency remain under review.'});
 return {...controls,registration,sources,activityParts,decodedSourceCount:files.size};
}
