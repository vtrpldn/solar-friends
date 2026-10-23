import {createResidentAppearanceLibrary} from './resident-appearance-library.js';
const legacyLibraries=new WeakMap();

// Crop the same approved standing frame as the character creator. Fit the
// portrait without changing the painted face/body proportions.
export function paintResidentPortrait(canvas,appearance,source,{filter='none'}={}){
  let library=source;
  if(Array.isArray(source)){if(!legacyLibraries.has(source))legacyLibraries.set(source,createResidentAppearanceLibrary({base:source}));library=legacyLibraries.get(source);}
  const frame=library.portraitFrame(appearance);
  paintPreparedResidentPortrait(canvas,frame,{filter});
}

export function paintPreparedResidentPortrait(canvas,frame,{filter='none'}={}){
  if(frame?.width!==256||frame?.height!==256)throw Error('Use a shared prepared resident frame for the portrait.');
  const c=canvas.getContext('2d'),scale=Math.min(canvas.width/128,canvas.height/152),width=128*scale,height=152*scale;
  c.clearRect(0,0,canvas.width,canvas.height);c.save();c.filter=filter;
  c.drawImage(frame,64,12,128,152,(canvas.width-width)/2,(canvas.height-height)/2,width,height);c.restore();
}
