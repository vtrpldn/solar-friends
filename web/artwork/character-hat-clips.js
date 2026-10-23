// These are review capabilities, not playable appearance choices. Add a clip
// only with its own body-bound placement data and visual/motion evidence.
export const hatReviewClips=Object.freeze(Object.fromEntries([
 ['breathe','breathing','base',[8,9,10,11],4],
 ['walk','walking','base',[0,1,2,3],32],
 ['look','looking around','idle',[0,1,2,3],16],
 ['sit','sitting','base',[12,13,14,15],64],
 ['relax','relaxing','idle',[12,13,14,15],32],
].map(([key,label,sheet,indices,maxOffset])=>[key,Object.freeze({label,sheet,indices:Object.freeze(indices),maxOffset})])));
export function hatReviewClip(clip){if(typeof clip!=='string'||!Object.hasOwn(hatReviewClips,clip))throw Error('This hat activity has not been registered for review.');return hatReviewClips[clip];}
