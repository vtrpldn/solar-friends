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

// Crops remain in native body coordinates even when accessories add margins.
export function paintPreparedResidentPortrait(canvas,frame,{filter='none',origin=[0,0],crop=[64,12,128,152]}={}){
  if(!Array.isArray(origin)||origin.length!==2||origin.some(n=>!Number.isSafeInteger(n)||n< -128||n>0)||!Number.isSafeInteger(frame?.width)||!Number.isSafeInteger(frame?.height)||frame.width<256||frame.height<256||frame.width>512||frame.height>512||origin[0]+frame.width<256||origin[1]+frame.height<256)throw Error('Use a shared prepared resident frame and bounded native origin for the portrait.');
  if(!Array.isArray(crop)||crop.length!==4||crop.some(n=>!Number.isFinite(n))||crop[0]< -128||crop[1]< -128||crop[2]<=0||crop[3]<=0||crop[0]+crop[2]>384||crop[1]+crop[3]>384)throw Error('Use bounded native portrait framing.');
  const c=canvas.getContext('2d'),scale=Math.min(canvas.width/crop[2],canvas.height/crop[3]),width=crop[2]*scale,height=crop[3]*scale;
  c.clearRect(0,0,canvas.width,canvas.height);c.save();try{c.filter=filter;c.drawImage(frame,crop[0]-origin[0],crop[1]-origin[1],crop[2],crop[3],(canvas.width-width)/2,(canvas.height-height)/2,width,height);}finally{c.restore();}
}
