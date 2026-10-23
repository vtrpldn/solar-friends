import {loadCharacterImageSource} from '../character-image-source.js';
import {residentPartRecipe} from '../resident-part-recipe.js';
import {composeHatPrototypeFrame} from '../character-hat.js';
export {composeHatPrototypeFrame,composeHatBreatheFrame,composeHatClipFrame} from '../character-hat.js';
export async function installHatPrototypeReview({binding,providers,scene,before}){
 const root='/art/characters/prototype-v1/',registration=await(await fetch(root+'straw-hat-base8-v3-registration.json')).json(),source=await loadCharacterImageSource(root+registration.file),frames=new Map();
 const section=document.createElement('section');section.id='straw-hat-prototype-review';const title=document.createElement('h2');title.textContent='Straw hat · single-pose accessory prototype';const note=document.createElement('p');note.textContent='Review candidate only. Standing pose 8 with both current hairstyles, at the existing resident scale. Check brim size, forehead/ear contact and hair overlap. This view isolates the standing source; the player option uses the complete shared pose and feeding-return provider.';section.append(title,note);const grid=document.createElement('div');grid.className='body-review-scenes';
 for(const hair of ['short-curls-v1','side-part-v1']){
  const appearance=residentPartRecipe({hair}),provider=providers.get(hair),original=provider.frameForPose('base',8),frame=composeHatPrototypeFrame({appearanceFrame:original,binding,registration,...source});frames.set(hair,{frame,original,appearance});
  for(const facing of [1,-1])for(const night of [0,1]){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=900;canvas.height=420;caption.textContent=`${hair} · ${facing===1?'right':'left'} · ${night?'night':'day'}`;figure.append(canvas,caption);grid.append(figure);scene(canvas,night,{hairFrame:frame,facingOverride:facing});}
 }
 section.append(grid);before.before(section);return {frames,registration,...source};
}
