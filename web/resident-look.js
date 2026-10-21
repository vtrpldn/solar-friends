export const residentLookKeys=['iara','bento','luz','caua','nina'];
export function residentLookIndex(person){
 const index=residentLookKeys.indexOf(person?.appearance?.preset);
 if(index<0||person?.appearance?.version!==1)throw Error('This resident artwork revision is unavailable.');
 return index;
}
