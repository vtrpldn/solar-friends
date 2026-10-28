// RGBA surface upper bound for the 48 ordinary pose slots plus two feeding
// return slots. Aliased frames may be counted twice; decoded images, internal
// family caches and browser/GPU overhead are deliberately separate metrics.
export function residentProviderRgbaUpperBound(provider){
 if(typeof provider?.frameForPose!=='function')throw Error('Measure a prepared resident provider.');
 let bytes=0;
 const add=(sheet,index,pose)=>{const frame=provider.frameForPose(sheet,index,pose);if(!Number.isSafeInteger(frame?.width)||!Number.isSafeInteger(frame?.height)||frame.width<256||frame.height<256||frame.width>512||frame.height>512)throw Error('Measure bounded live resident frames.');bytes+=frame.width*frame.height*4;};
 for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++)add(sheet,index);
 for(const index of [13,14])add('activities',index,{sequenceIndex:5});
 return bytes;
}
