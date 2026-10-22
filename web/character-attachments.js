import {FRAME_ANCHOR} from './sprite-frames.js';
import {canonical} from './editor/journal.js';
export const attachmentSockets=Object.freeze(['head','neck','nearHand','farHand']);
const sheets=['base','idle','activities'],clone=value=>structuredClone(value),exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export async function attachmentBinding(frames,sources){
 const result={normalization:1,size:256,anchor:FRAME_ANCHOR,sources:{},frames:{}};
 for(const sheet of sheets){
  if(!/^[a-f0-9]{64}$/.test(sources?.[sheet]??'')||frames[sheet]?.length!==16)throw Error('Provide all 48 measured body frames.');
  result.sources[sheet]=sources[sheet];result.frames[sheet]=[];
  for(const frame of frames[sheet]){if(frame.width!==256||frame.height!==256)throw Error('Attachment guides require the shared 256-pixel body transform.');const pixels=frame.getContext('2d').getImageData(0,0,256,256);result.frames[sheet].push([...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels.data))].map(n=>n.toString(16).padStart(2,'0')).join(''));}
 }
 return result;
}
export function validateAttachmentBinding(binding){
 if(!exact(binding,['normalization','size','anchor','sources','frames'])||binding.normalization!==1||binding.size!==256||binding.anchor!==FRAME_ANCHOR||!exact(binding.sources,sheets)||!exact(binding.frames,sheets)||sheets.some(sheet=>!/^[a-f0-9]{64}$/.test(binding.sources[sheet]??'')||!Array.isArray(binding.frames[sheet])||binding.frames[sheet].length!==16||Array.from(binding.frames[sheet]).some(hash=>typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))))throw Error('Use a measured binding for all 48 prepared body frames.');
}
export function validateAttachmentRig(value,binding){
 validateAttachmentBinding(binding);
 if(!exact(value,['schema','body','poses'])||value.schema!==1||canonical(value.body)!==canonical(binding)||!exact(value.poses,sheets))throw Error('These guides do not match the exact body sources and prepared frames.');
 for(const sheet of sheets){
  if(!Array.isArray(value.poses[sheet])||value.poses[sheet].length!==16)throw Error('Keep all 48 body pose slots.');
  for(const pose of value.poses[sheet]){
   if(!exact(pose,attachmentSockets))throw Error('Each pose needs the four supported attachment slots.');
   for(const socket of attachmentSockets){const point=pose[socket];if(point===null)continue;
    if(!exact(point,['visibility','position']))throw Error('Use a supported attachment point.');
    if(point.visibility==='occluded'&&socket.endsWith('Hand')&&point.position===null)continue;
    if(point.visibility!=='visible'||!Array.isArray(point.position)||point.position.length!==2||point.position.some(n=>!Number.isFinite(n)||n<0||n>256))throw Error('Mark a visible point inside the shared body frame, or explicitly mark a hidden hand.');
   }
  }
 }
 return clone(value);
}
export function attachmentPoint(point,facing=1){
 if(![1,-1].includes(facing))throw Error('Choose a supported facing.');
 if(!point||point.visibility!=='visible')return null;
 return [facing===1?point.position[0]:256-point.position[0],point.position[1]];
}
export class AttachmentRigDocument extends EventTarget{
 #binding;#value;#past=[];#future=[];
 constructor(binding){super();validateAttachmentBinding(binding);this.#binding=clone(binding);this.#value={schema:1,body:clone(binding),poses:Object.fromEntries(sheets.map(sheet=>[sheet,Array.from({length:16},()=>Object.fromEntries(attachmentSockets.map(key=>[key,null])))]))};}
 get value(){return clone(this.#value);}
 get canUndo(){return this.#past.length>0;}get canRedo(){return this.#future.length>0;}
 get recorded(){return Object.values(this.#value.poses).flat().filter(p=>attachmentSockets.every(key=>p[key]!==null)).length;}
 set(sheet,index,socket,point){if(!sheets.includes(sheet)||!Number.isInteger(index)||index<0||index>=16||!attachmentSockets.includes(socket))throw Error('Choose a supported pose and attachment.');const next=this.value;next.poses[sheet][index][socket]=clone(point);return this.#change(next);}
 import(value){return this.#change(value);}
 // Completeness is coordinate coverage, never visual or gameplay approval.
 requireComplete(){if(this.recorded!==48)throw Error('Record every attachment or explicit hand occlusion in all 48 poses first.');return this.value;}
 #change(value){const next=validateAttachmentRig(value,this.#binding);if(canonical(next)===canonical(this.#value))return false;this.#past.push(this.#value);if(this.#past.length>64)this.#past.shift();this.#value=next;this.#future=[];this.dispatchEvent(new Event('change'));return true;}
 undo(){if(!this.canUndo)return false;this.#future.push(this.#value);this.#value=this.#past.pop();this.dispatchEvent(new Event('change'));return true;}
 redo(){if(!this.canRedo)return false;this.#past.push(this.#value);this.#value=this.#future.pop();this.dispatchEvent(new Event('change'));return true;}
}
