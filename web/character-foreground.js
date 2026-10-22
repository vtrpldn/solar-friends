import {canonical} from './editor/journal.js';
import {validateAttachmentBinding} from './character-attachments.js';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function validateBodyForegroundMask(mask,binding,sheet,index){
 validateAttachmentBinding(binding);
 if(!exact(mask,['schema','body','sheet','index','size','polygons'])||mask.schema!==1||mask.size!==1254||!['base','idle','activities'].includes(sheet)||!Number.isInteger(index)||index<0||index>=16||mask.sheet!==sheet||mask.index!==index||canonical(mask.body)!==canonical(binding)||!Array.isArray(mask.polygons)||mask.polygons.length<1||mask.polygons.length>8)throw Error('This foreground mask does not match the exact body pose.');
 for(const polygon of Array.from(mask.polygons)){
  if(!Array.isArray(polygon)||polygon.length<3||polygon.length>64||Array.from(polygon).some(point=>!Array.isArray(point)||point.length!==2||Array.from(point).some(n=>!Number.isFinite(n)||n<0||n>1254)))throw Error('Use bounded foreground polygons in the shared body frame.');
  const area=polygon.reduce((sum,point,i)=>{const next=polygon[(i+1)%polygon.length];return sum+point[0]*next[1]-point[1]*next[0];},0);if(Math.abs(area)<1e-6)throw Error('Foreground polygons must enclose a visible area.');
 }
 return structuredClone(mask);
}
export async function createBodyForegroundLayers({body,binding,mask,sheet,index}){
 const checked=validateBodyForegroundMask(mask,binding,sheet,index);
 if(body.width!==256||body.height!==256)throw Error('Foreground layers require the shared prepared body frame.');
 const original=body.getContext('2d').getImageData(0,0,256,256),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',original.data))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==binding.frames[sheet][index])throw Error('The prepared body pixels differ from the foreground mask.');
 const region=document.createElement('canvas');region.width=region.height=256;const ctx=region.getContext('2d');ctx.save();ctx.scale(256/checked.size,256/checked.size);ctx.beginPath();
 for(const polygon of checked.polygons){ctx.moveTo(...polygon[0]);for(const point of polygon.slice(1))ctx.lineTo(...point);ctx.closePath();}
 ctx.fillStyle='#fff';ctx.fill();ctx.restore();const coverage=ctx.getImageData(0,0,256,256).data,back=document.createElement('canvas'),front=document.createElement('canvas');back.width=back.height=front.width=front.height=256;
 const backPixels=new ImageData(original.data.slice(),256,256),frontPixels=new ImageData(256,256);
 // Disjoint ownership preserves original antialiased edges: never draw the
 // same body pixel in both layers and accidentally double its alpha.
 for(let pixel=0;pixel<256*256;pixel++)if(coverage[pixel*4+3]>=128)for(let channel=0;channel<4;channel++){frontPixels.data[pixel*4+channel]=original.data[pixel*4+channel];backPixels.data[pixel*4+channel]=0;}
 back.getContext('2d').putImageData(backPixels,0,0);front.getContext('2d').putImageData(frontPixels,0,0);return {back,front};
}
