import {canonical} from './editor/journal.js';
import {validateAttachmentBinding} from './character-attachments.js';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const point=p=>Array.isArray(p)&&p.length===2&&Array.from(p).every(n=>Number.isSafeInteger(n)&&n>=0&&n<256);
// Reuse complete cap paint with independently verified source and target bodies.
// All coordinates stay in the shared native body frame. No scale,
// rotation, silhouette-fitting, crop or forgiving source fallback is available.
export function registeredHairPlacement(registration){
 const p=registration.placement;if(p===undefined)return null;
 const r=p?.reference;
 if(!exact(p,['schema','reference','targetSocket'])||p.schema!==1||!exact(r,['body','sheet','index','partSha256','size','bounds','socket'])||!['base','idle','activities'].includes(r.sheet)||!Number.isSafeInteger(r.index)||r.index<0||r.index>15||!point(r.socket)||!point(p.targetSocket))throw Error('Use a measured source and target crown socket.');
 validateAttachmentBinding(r.body);validateAttachmentBinding(registration.body);
 if(registration.body.normalization!==2||r.partSha256!==registration.partSha256||r.size!==registration.size||canonical(r.bounds)!==canonical(registration.bounds))throw Error('Hair reuse requires the exact declared source pose and complete cap paint.');
 const offset=p.targetSocket.map((n,i)=>n-r.socket[i]),bounds=registration.bounds.map(n=>n*256/1254);
 if(offset.some(n=>Math.abs(n)>64)||bounds[0]+offset[0]<0||bounds[1]+offset[1]<0||bounds[0]+bounds[2]+offset[0]>256||bounds[1]+bounds[3]+offset[1]>256)throw Error('Keep the whole translated cap inside the native frame.');
 return structuredClone({offset,reference:r,targetSocket:p.targetSocket});
}
export async function verifyHairPlacementBodies(placement,body,referenceBody){
 if(!placement)return;
 if(referenceBody?.width!==256||referenceBody?.height!==256||typeof referenceBody.getContext!=='function')throw Error('Provide the original prepared source body for this cap.');
 const data=referenceBody.getContext('2d').getImageData(0,0,256,256).data,hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join(''),r=placement.reference;
 if(hash!==r.body.frames[r.sheet][r.index])throw Error('The source body pose used to place this cap changed.');
 for(const [frame,point]of [[referenceBody,r.socket],[body,placement.targetSocket]])if(frame.getContext('2d').getImageData(point[0],point[1],1,1).data[3]<32)throw Error('Crown sockets must lie on the delivered body paint.');
}
