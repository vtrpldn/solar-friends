import {createAppearanceCache} from '../appearance-cache.js';
import {defaultBodyMaterials,validateBodyMaterials} from '../character-materials.js';
import {loadCharacterImageSource} from '../character-image-source.js';
import {registeredHairFrame} from './character-single-hair.js';
import {installAppearanceControls} from './character-composed-review.js';
// A partial art review has its own explicit recipe, never a saved resident look.
export function sidePartReviewRecipe(materials=defaultBodyMaterials){return {reviewSchema:1,body:'neutral-v1',hair:'side-part-v1',materials:validateBodyMaterials(materials)};}
export async function installSidePartReview({frames,binding,materials,scene,before}){
 const root='/art/characters/prototype-v1/',response=await fetch(root+'hair-sidepart-breathe-v1-registration.json');if(!response.ok)throw Error('Cannot load the partial hairstyle review.');
 const registration=await response.json();if(registration.schema!==1||registration.clip!=='breathe'||registration.sheet!=='base'||Object.keys(registration.poses??{}).sort().join(',')!=='10,11,8,9')throw Error('Provide all four registered side-part breathing poses.');
 const sources=new Map();for(const index of [8,9,10,11]){const pose=registration.poses[index];if(pose.file!==`hair-sidepart-base-${index}-candidate-v1.png`||pose.sheet!=='base'||pose.index!==index)throw Error('Choose the bundled side-part pose.');sources.set(index,await loadCharacterImageSource(root+pose.file));}
 const cache=createAppearanceCache({maxEntries:6,maxConcurrent:2,maxQueued:24,compose:async recipe=>{
  const painted=materials.provider(recipe.materials),composed=new Map();for(const [index,source]of sources)composed.set(index,await registeredHairFrame({body:frames.base[index],binding,registration:{...registration.poses[index],body:registration.body},image:source.image,sourceHash:source.sourceHash,appearanceBody:painted.frameForPose('base',index)}));
  return {interpolation:'keyframes',frameForPose(sheet,index){if(sheet!=='base'||!composed.has(index))throw Error('The partial side-part hairstyle has no artwork for this pose.');return composed.get(index);}};
 }});
 const model={provider(clip,recipe=sidePartReviewRecipe()){
  if(clip!=='breathe')return Promise.reject(Error('This hairstyle is only painted for the breathing review.'));
  let checked;try{if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||Object.keys(recipe).sort().join(',')!=='body,hair,materials,reviewSchema'||recipe.reviewSchema!==1||recipe.body!=='neutral-v1'||recipe.hair!=='side-part-v1')throw Error('Choose the partial side-part review recipe.');checked=sidePartReviewRecipe(recipe.materials);}catch(error){return Promise.reject(error);}
  return cache.get(JSON.stringify(checked),checked);
 },clear:()=>cache.clear(),cacheInfo:()=>{const info=cache.info();return {...info,frames:info.entries*4,maximumFrames:24,rgbaBytes:info.entries*4*256*256*4};}};
 const controls=await installAppearanceControls({model,scene,before,prefix:'sidepart-appearance',makeRecipe:sidePartReviewRecipe,clipKeys:['breathe'],titleText:'Side part · breathing prototype',noteText:'Four newly painted hair layers share the unchanged body and matching portrait. Other 44 poses are unpainted. This incomplete hairstyle is excluded from player recipes, saves and character choices; crown, ear contact, style and temporal consistency remain under review.'});
 return {...controls,registration,sources};
}
