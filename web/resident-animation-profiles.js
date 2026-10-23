// Presentation belongs to the painted body, never the person's identity,
// skills or save history. Original cast sheets retain their existing timing.
export const residentAnimationProfiles=Object.freeze({
 'neutral-v1':Object.freeze({breathe:Object.freeze({durations:Object.freeze([2,.15,1.35,1.5])})}),
});
export function residentClipTiming(profile,mode){
 if(profile==null)return null;
 if(typeof profile!=='string'||!Object.hasOwn(residentAnimationProfiles,profile))throw Error('This resident animation profile is unavailable.');
 return residentAnimationProfiles[profile][mode]??null;
}
