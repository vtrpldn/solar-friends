import {residentLookIndex} from './resident-look.js';
import {preparedFrames} from './sprite-frames.js';

// Crop the same approved standing frame as the character creator. Fit the
// portrait without changing the painted face/body proportions.
export function paintResidentPortrait(canvas,appearance,images,{filter='none'}={}){
  if(!appearance||Object.keys(appearance).some(key=>!['preset','version'].includes(key)))throw Error('This resident artwork is unavailable.');
  const image=images[residentLookIndex({appearance})];
  const frame=preparedFrames(image,{referenceRow:2})?.[8];
  if(!frame)throw Error('This resident portrait could not load.');
  const c=canvas.getContext('2d'),scale=Math.min(canvas.width/128,canvas.height/152),width=128*scale,height=152*scale;
  c.clearRect(0,0,canvas.width,canvas.height);c.save();c.filter=filter;
  c.drawImage(frame,64,12,128,152,(canvas.width-width)/2,(canvas.height-height)/2,width,height);c.restore();
}
