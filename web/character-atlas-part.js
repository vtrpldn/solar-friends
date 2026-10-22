import {auditCharacterPartRegion} from './character-parts.js';
const rectangles=[[0,0,1254,1254],[0,0,1254,600],[0,600,1254,654]];
// Bundled parts can share an atlas, but inherit its whole-frame coordinates.
// These fixed partitions separate disjoint objects, never fit a silhouette.
export function extractRegisteredAtlasPart({image,sourceHash,registration}){
 if(!registration||Object.keys(registration).sort().join(',')!=='bounds,sha256,size,sourceRect'||registration.size!==1254||image.width!==1254||image.height!==1254||!/^[a-f0-9]{64}$/.test(sourceHash??'')||sourceHash!==registration.sha256||!rectangles.some(r=>JSON.stringify(r)===JSON.stringify(registration.sourceRect)))throw Error('Use a supported source-bound part rectangle.');
 const [x,y,width,height]=registration.sourceRect,bounds=registration.bounds;
 if(!Array.isArray(bounds)||bounds.length!==4||Array.from(bounds).some(n=>!Number.isFinite(n))||bounds[0]<x||bounds[1]<y||bounds[0]+bounds[2]>x+width||bounds[1]+bounds[3]>y+height)throw Error('Part bounds must stay inside their atlas partition.');
 const frame=document.createElement('canvas');frame.width=frame.height=1254;const ctx=frame.getContext('2d');ctx.drawImage(image,x,y,width,height,x,y,width,height);const audit=auditCharacterPartRegion(ctx.getImageData(0,0,1254,1254),bounds);
 if(!audit.ok)throw Error('This atlas part fails its authored pose bounds.');
 // Whole-frame sources need no extraction. Retain the decoded image so an
 // extra canvas round trip cannot change fractional-alpha edge colours.
 return {frame:height===1254?image:frame,audit};
}
export function composeActivityUnderlay(appearance,activity){
 if(appearance.width!==256||appearance.height!==256||activity.frame.width!==1254||activity.frame.height!==1254||!activity.audit.ok)throw Error('Use registered appearance and activity frames.');
 const frame=document.createElement('canvas');frame.width=frame.height=256;const ctx=frame.getContext('2d');ctx.drawImage(activity.frame,0,0,256,256);ctx.drawImage(appearance,0,0);frame.dataset.partCoverage=appearance.dataset.partCoverage;frame.dataset.activityCoverage=String(activity.audit.coverage);return frame;
}
