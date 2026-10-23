// Body-bound hat placements shared by gameplay and artwork review.
export const hatReviewClips=Object.freeze(Object.fromEntries([
 ['breathe','breathing','base',[8,9,10,11],4],
 ['walk','walking','base',[0,1,2,3],32],
 ['look','looking around','idle',[0,1,2,3],16],
 ['sit','sitting','base',[12,13,14,15],64],
 ['relax','relaxing','idle',[12,13,14,15],32],
 ['stretch','stretching','idle',[4,5,6,7],32],
 ['wave','waving','idle',[8,9,10,11],32],
 ['work','working','base',[4,5,6,7],64],
 ['cook','cooking','activities',[0,1,2,3],32],
 ['water','watering','activities',[4,5,6,7],48],
 ['tend','tending','activities',[8,9,10,11],96],
 ['feed','feeding','activities',[12,13,14,15],32],
].map(([key,label,sheet,indices,maxOffset])=>[key,Object.freeze({label,sheet,indices:Object.freeze(indices),maxOffset})])));
export function hatReviewClip(clip){if(typeof clip!=='string'||!Object.hasOwn(hatReviewClips,clip))throw Error('This hat activity has not been registered for review.');return hatReviewClips[clip];}
