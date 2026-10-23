// Shared pose-bound mask validation; independent of hair and garment painters.
import {canonical} from './editor/journal.js';
import {validateAttachmentBinding} from './character-attachments.js';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function validateBodyForegroundMask(mask,binding,sheet,index){
 validateAttachmentBinding(binding);
 const raster=mask?.schema===2;
 if(!exact(mask,raster?['schema','body','sheet','index','size','runs']:['schema','body','sheet','index','size','polygons'])||![1,2].includes(mask.schema)||mask.size!==(raster?256:1254)||!['base','idle','activities'].includes(sheet)||!Number.isInteger(index)||index<0||index>=16||mask.sheet!==sheet||mask.index!==index||canonical(mask.body)!==canonical(binding))throw Error('This foreground mask does not match the exact body pose.');
 if(raster){
  if(!Array.isArray(mask.runs)||mask.runs.length<1||mask.runs.length>2048)throw Error('Provide bounded foreground pixel runs.');
  let end=0;
  for(const run of Array.from(mask.runs)){
   if(!Array.isArray(run)||run.length!==2||Array.from(run).some(n=>!Number.isSafeInteger(n))||run[0]<end||run[0]<0||run[1]<1||run[0]+run[1]>256*256)throw Error('Foreground pixel runs must be ordered, disjoint and inside the frame.');
   end=run[0]+run[1];
  }
  return structuredClone(mask);
 }
 if(!Array.isArray(mask.polygons)||mask.polygons.length<1||mask.polygons.length>8)throw Error('Provide bounded foreground polygons.');
 for(const polygon of Array.from(mask.polygons)){
  if(!Array.isArray(polygon)||polygon.length<3||polygon.length>64||Array.from(polygon).some(point=>!Array.isArray(point)||point.length!==2||Array.from(point).some(n=>!Number.isFinite(n)||n<0||n>1254)))throw Error('Use bounded foreground polygons in the shared body frame.');
  const area=polygon.reduce((sum,point,i)=>{const next=polygon[(i+1)%polygon.length];return sum+point[0]*next[1]-point[1]*next[0];},0);if(Math.abs(area)<1e-6)throw Error('Foreground polygons must enclose a visible area.');
 }
 return structuredClone(mask);
}
