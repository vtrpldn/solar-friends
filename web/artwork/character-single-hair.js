import {canonical} from '../editor/journal.js';
import {auditCharacterPartRegion} from '../character-parts.js';
import {createBodyForegroundLayers} from '../character-foreground.js';
// One source-bound pose for production review, never a playable appearance.
export async function singleHairFrame({body,binding,registration,image,sourceHash}){
 if(registration.sheet!=='base'||registration.index!==8)throw Error('Only base pose 8 is supported by this single-pose review.');
 return registeredHairFrame({body,binding,registration,image,sourceHash});
}
export async function registeredHairFrame({body,binding,registration,image,sourceHash}){
 if(registration.schema!==1||!['base','idle','activities'].includes(registration.sheet)||!Number.isInteger(registration.index)||registration.index<0||registration.index>15||registration.size!==1254||!/^[a-f0-9]{64}$/.test(sourceHash??'')||registration.partSha256!==sourceHash||canonical(registration.body)!==canonical(binding)||body.width!==256||body.height!==256||image.width!==1254||image.height!==1254)throw Error('Review the changed hair/body registration before composing this pose.');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==binding.frames[registration.sheet][registration.index])throw Error('The prepared body pose changed.');
 const raw=document.createElement('canvas');raw.width=raw.height=1254;const rawContext=raw.getContext('2d');rawContext.drawImage(image,0,0);const audit=auditCharacterPartRegion(rawContext.getImageData(0,0,1254,1254),registration.bounds);
 if(!audit.ok)throw Error('This hair layer fails its authored pose bounds.');
 const frame=document.createElement('canvas');frame.width=frame.height=256;
 const ctx=frame.getContext('2d'),layers=registration.foreground!==undefined?await createBodyForegroundLayers({body,binding,mask:registration.foreground,sheet:registration.sheet,index:registration.index}):null;
 ctx.drawImage(layers?layers.back:body,0,0);ctx.drawImage(image,0,0,256,256);if(layers)ctx.drawImage(layers.front,0,0);
 frame.dataset.partCoverage=String(audit.coverage);
 return frame;
}
export async function installSingleHairReview({body,binding,scene,before}){
 const root='../art/characters/prototype-v1/',file='hair-curls-single-candidate-v3.png';
 const bytes=await(await fetch(root+file)).arrayBuffer(),sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const image=new Image();image.src=root+file;await image.decode();
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
