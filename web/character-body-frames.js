import {FRAME_ANCHOR,locateSpriteFrames} from './sprite-frames.js';
// Body-owned landmarks replace lower-leg centering only for an explicitly
// registered source. Garments and attachments must bind to the resulting RGBA.
// No per-pose scale, local warp, inferred attachment anchor or fallback.
export function validateBodyFrameRegistration(registration){
 const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
 const r=registration,s=r?.source;
 if(!exact(r,['schema','family','sheet','source','uniformScale','frames'])||r.schema!==1||typeof r.family!=='string'||!r.family.length||!['base','idle','activities'].includes(r.sheet)||!exact(s,['sha256','width','height','columns','rows']))throw Error('Use a complete body-source registration.');
 if(!/^[a-f0-9]{64}$/.test(s.sha256??''))throw Error('Use the exact body source identity.');
 if(![s.width,s.height,s.columns,s.rows].every(Number.isSafeInteger)||s.width<1||s.height<1||s.width>4096||s.height>4096||s.columns<1||s.rows<1||s.columns*s.rows>16||!Number.isFinite(r.uniformScale)||r.uniformScale<=0||r.uniformScale>1||!Array.isArray(r.frames)||r.frames.length!==s.columns*s.rows)throw Error('Use bounded body-source geometry and one uniform scale.');
 for(const [index,f]of r.frames.entries()){
  if(!exact(f,['index','waist'])||!Number.isSafeInteger(f.index)||f.index!==index||!Array.isArray(f.waist)||f.waist.length!==2||!Array.from(f.waist).every(Number.isSafeInteger))throw Error('Use ordered body poses with measured waist landmarks.');
 }
}
export function prepareRegisteredBodyFrames({image,sourceHash},registration){
 validateBodyFrameRegistration(registration);
 const r=registration,s=r.source;
 if(!/^[a-f0-9]{64}$/.test(sourceHash??'')||sourceHash!==s.sha256||!image?.complete||image.naturalWidth!==s.width||image.naturalHeight!==s.height)throw Error('Use the exact decoded body source.');
 const source=document.createElement('canvas');source.width=s.width;source.height=s.height;
 const output=[];
 try{
  const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,s.width,s.height),layout=locateSpriteFrames(pixels.data,s.width,s.height,s.columns,s.rows,0);
  for(let i=0;i<r.frames.length;i++){
   const f=layout.frames[i],waist=r.frames[i].waist;
   if(waist[0]<f.left||waist[0]>=f.right||waist[1]<f.top||waist[1]>=f.bottom||layout.owners[waist[1]*s.width+waist[0]]!==f.id)throw Error('The waist landmark must belong to its painted body.');
   const left=Math.max(0,f.left-2),top=Math.max(0,f.top-2),right=Math.min(s.width,f.right+2),bottom=Math.min(s.height,f.bottom+2),scale=r.uniformScale;
   const x=128+(left-waist[0])*scale,y=FRAME_ANCHOR*256+(top-f.bottom)*scale;
   if(x<0||y<0||x+(right-left)*scale>256||y+(bottom-top)*scale>256)throw Error('The full registered body must fit without cropping.');
   const cut=document.createElement('canvas');cut.width=right-left;cut.height=bottom-top;
   try{
    const cc=cut.getContext('2d'),part=cc.createImageData(cut.width,cut.height);
    for(let sy=top;sy<bottom;sy++)for(let sx=left;sx<right;sx++){
     const p=sy*s.width+sx;if(layout.owners[p]!==f.id)continue;
     part.data.set(pixels.data.subarray(p*4,p*4+4),((sy-top)*cut.width+sx-left)*4);
    }
    cc.putImageData(part,0,0);
    const frame=document.createElement('canvas');frame.width=frame.height=256;output.push(frame);
    frame.getContext('2d').drawImage(cut,x,y,cut.width*scale,cut.height*scale);
   }finally{cut.width=cut.height=0;}
  }
  return output;
 }catch(error){for(const frame of output)frame.width=frame.height=0;throw error;}
 finally{source.width=source.height=0;}
}
