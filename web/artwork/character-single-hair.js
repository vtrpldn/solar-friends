import {registeredHairFrame} from '../character-hair.js';
export {registeredHairFrame} from '../character-hair.js';
import {loadCharacterImageSource} from '../character-image-source.js';
// One source-bound pose for production review, never a playable appearance.
export async function singleHairFrame({body,binding,registration,image,sourceHash}){
 if(registration.sheet!=='base'||registration.index!==8)throw Error('Only base pose 8 is supported by this single-pose review.');
 return registeredHairFrame({body,binding,registration,image,sourceHash});
}
export async function installSingleHairReview({body,binding,scene,before}){
 const root='../art/characters/prototype-v1/',file='hair-curls-single-candidate-v3.png';
 const {image,sourceHash}=await loadCharacterImageSource(root+file);
 const registration=await(await fetch(root+'hair-single-v3-registration.json')).json();
 const frame=await singleHairFrame({body,binding,registration,image,sourceHash});
 const section=document.createElement('section');section.id='single-hair-review';
 const title=document.createElement('h2');title.textContent='Short curls · single standing pose';
 const note=document.createElement('p');note.textContent='Prototype only: base pose 8. Bento and the unchanged neutral body with registered curls, at the same game scale. Both facings and existing night tint. Additional pose groups are reviewed separately below; this is not a complete playable hairstyle.';
 section.append(title,note);const grid=document.createElement('div');grid.className='body-review-scenes';
 for(const facing of [1,-1])for(const night of [0,1]){
  const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=900;canvas.height=420;
  caption.textContent=`${facing===1?'Right':'Left'} · ${night?'night':'day'} · static pose 8`;
  figure.append(canvas,caption);grid.append(figure);scene(canvas,night,{hairFrame:frame,facingOverride:facing});
 }
 section.append(grid);before.before(section);
 return {frame,registration,sourceHash};
}
