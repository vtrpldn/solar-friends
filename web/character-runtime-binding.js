import {canonical} from './editor/journal.js';
import {validateAttachmentBinding} from './character-attachments.js';
// A published descriptor already pins all registration bytes. Browser canvas
// resampling can differ at edge pixels, so its reference raster hashes are not
// portable. Keep exact source ownership/transforms, then bind every component
// to the newly prepared runtime raster. Later per-frame guards remain strict.
// Only call for a private definition copy from a hash-pinned bundled catalog.
export function bindComposedRuntimeRaster(definition,family){
 const reference=definition.materials?.body,runtime=family?.binding;validateAttachmentBinding(reference);validateAttachmentBinding(runtime);
 if(reference.normalization!==2||runtime.normalization!==2||reference.size!==runtime.size||reference.anchor!==runtime.anchor||canonical(reference.ownership)!==canonical(runtime.ownership)||canonical(definition.ownership)!==canonical(runtime.ownership))throw Error('Runtime raster binding cannot change resident source ownership or placement.');
 const expected=canonical(reference);let rebound=0;
 const visit=value=>{
  if(!value||typeof value!=='object')return;
  for(const [key,child]of Object.entries(value)){
   if(key==='body'){
    if(canonical(child)!==expected)throw Error('Resident components do not share the pinned body registration.');
    value[key]=structuredClone(runtime);rebound++;
   }else if(key==='bodyFrameSha256'){value[key]=runtime.frames[value.sheet][value.index];}
   else visit(child);
  }
 };
 // Check every component before changing any private registration.
 const check=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(key==='body'){if(canonical(child)!==expected)throw Error('Resident components do not share the pinned body registration.');}else if(key==='bodyFrameSha256'){if(!Number.isSafeInteger(value.index)||value.index<0||value.index>15||!['base','idle','activities'].includes(value.sheet)||child!==reference.frames[value.sheet][value.index])throw Error('Resident pose hash differs from the pinned body registration.');}else check(child);}};
 check(definition);visit(definition);return rebound;
}
