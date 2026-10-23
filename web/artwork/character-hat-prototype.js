import {loadCharacterImageSource} from '../character-image-source.js';
import {auditCharacterPartRegion} from '../character-parts.js';
import {canonical} from '../editor/journal.js';
import {residentPartRecipe} from '../resident-part-recipe.js';
// Deliberately separate from saved/player appearance recipes until every pose
// has its own approved fit and foreground-hand/equipment treatment.
export function composeHatPrototypeFrame({appearanceFrame,binding,registration,image,sourceHash,sheet='base',index=8}){
 if(registration.reviewSchema!==1||sheet!=='base'||index!==8||registration.sheet!==sheet||registration.index!==index||registration.size!==1254||registration.sha256!==sourceHash||canonical(registration.body)!==canonical(binding)||appearanceFrame.width!==256||appearanceFrame.height!==256||image.width!==1254||image.height!==1254)throw Error('This hat prototype supports only its registered standing pose.');
 const source=document.createElement('canvas');source.width=source.height=1254;const context=source.getContext('2d');context.drawImage(image,0,0);let audit;try{audit=auditCharacterPartRegion(context.getImageData(0,0,1254,1254),registration.bounds);}finally{source.width=source.height=0;}if(!audit.ok)throw Error('Hat paint leaves the registered head region.');
 const frame=document.createElement('canvas');frame.width=frame.height=256;const ctx=frame.getContext('2d');ctx.drawImage(appearanceFrame,0,0);ctx.drawImage(image,0,0,256,256);frame.dataset.partCoverage=String(audit.coverage);return frame;
}
export async function installHatPrototypeReview({binding,providers,scene,before}){
 const root='/art/characters/prototype-v1/',registration=await(await fetch(root+'straw-hat-base8-v3-registration.json')).json(),source=await loadCharacterImageSource(root+registration.file),frames=new Map();
 const section=document.createElement('section');section.id='straw-hat-prototype-review';const title=document.createElement('h2');title.textContent='Straw hat · single-pose accessory prototype';const note=document.createElement('p');note.textContent='Review candidate only. Standing pose 8 with both current hairstyles, at the existing resident scale. Check brim size, forehead/ear contact and hair overlap. This is excluded from player choices; all other poses and raised-hand occlusion remain unfinished.';section.append(title,note);const grid=document.createElement('div');grid.className='body-review-scenes';
 for(const hair of ['short-curls-v1','side-part-v1']){
  const appearance=residentPartRecipe({hair}),provider=providers.get(hair),original=provider.frameForPose('base',8),frame=composeHatPrototypeFrame({appearanceFrame:original,binding,registration,...source});frames.set(hair,{frame,original,appearance});
  for(const facing of [1,-1])for(const night of [0,1]){const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=900;canvas.height=420;caption.textContent=`${hair} · ${facing===1?'right':'left'} · ${night?'night':'day'}`;figure.append(canvas,caption);grid.append(figure);scene(canvas,night,{hairFrame:frame,facingOverride:facing});}
 }
 section.append(grid);before.before(section);return {frames,registration,...source};
}
