import {locateSpriteFrames} from './sprite-frames.js';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const point=(value,width,height)=>Array.isArray(value)&&value.length===2&&Array.from(value).every((n,i)=>Number.isFinite(n)&&n>=0&&n<=(i?height:width));

// A ground origin is authored independently of the lowest painted boot. One
// scale applies to the whole atlas; each pose only receives a translation.
export function validateContactAtlasRegistration(r){
 if(!exact(r,['schema','family','sheet','source','uniformScale','frames'])||r.schema!==1||typeof r.family!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(r.family)||!['base','idle','activities'].includes(r.sheet)||!exact(r.source,['sha256','width','height','columns','rows']))throw Error('Use a complete contact-atlas registration.');
 const s=r.source;
 if(!/^[a-f0-9]{64}$/.test(s.sha256??'')||![s.width,s.height,s.columns,s.rows].every(Number.isSafeInteger)||s.width<1||s.height<1||s.width>4096||s.height>4096||s.columns<1||s.rows<1||s.columns*s.rows>16||!Number.isFinite(r.uniformScale)||r.uniformScale<=0||r.uniformScale>1||!Array.isArray(r.frames)||r.frames.length!==s.columns*s.rows)throw Error('Use bounded hashed atlas geometry and one uniform body scale.');
 for(let index=0;index<r.frames.length;index++){
  const pose=r.frames[index];
  if(!exact(pose,['index','sourceContact','nativeContact'])||pose.index!==index||!point(pose.sourceContact,s.width,s.height)||!point(pose.nativeContact,256,256))throw Error('Own an ordered ground contact for every atlas pose.');
 }
}

export function bodyTransformHasContacts(transform){return ['contact-v1','contact-atlas-v1'].includes(transform?.method);}
export function bodyTransformContact(transform,index){
 if(transform?.method==='contact-v1')return [...transform.registration.nativeContact];
 if(transform?.method==='contact-atlas-v1'){
  if(!Number.isSafeInteger(index)||index<0||index>=transform.registration.frames.length)throw Error('Choose an authored integer atlas contact.');
  const pose=transform.registration.frames[index];
  if(!pose)throw Error('Choose an authored atlas contact.');
  return [...pose.nativeContact];
 }
 return undefined;
}

export function prepareContactAtlasFrames({image,sourceHash},registration){
 const r=structuredClone(registration);validateContactAtlasRegistration(r);const s=r.source;
 if(sourceHash!==s.sha256||!image?.complete||image.naturalWidth!==s.width||image.naturalHeight!==s.height)throw Error('Use the exact decoded contact-atlas source.');
 const source=document.createElement('canvas');source.width=s.width;source.height=s.height;const frames=[];
 try{
  const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,s.width,s.height),layout=locateSpriteFrames(pixels.data,s.width,s.height,s.columns,s.rows,0);
  for(const [index,f]of layout.frames.entries()){
   if(f.left<2||f.top<2||f.right>s.width-2||f.bottom>s.height-2)throw Error('Keep each painted body clear of the source image edge.');
   const pose=r.frames[index],scale=r.uniformScale,left=f.left-2,top=f.top-2,right=f.right+2,bottom=f.bottom+2;
   const dx=pose.nativeContact[0]+(left-pose.sourceContact[0])*scale,dy=pose.nativeContact[1]+(top-pose.sourceContact[1])*scale;
   if(dx<0||dy<0||dx+(right-left)*scale>256||dy+(bottom-top)*scale>256)throw Error('The whole contact-registered atlas pose must fit without cropping.');
   const cut=document.createElement('canvas');cut.width=right-left;cut.height=bottom-top;
   try{
    const cc=cut.getContext('2d'),part=cc.createImageData(cut.width,cut.height);
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
     const p=y*s.width+x;if(layout.owners[p]!==f.id)continue;
     part.data.set(pixels.data.subarray(p*4,p*4+4),((y-top)*cut.width+x-left)*4);
    }
    cc.putImageData(part,0,0);
    const frame=document.createElement('canvas');frame.width=frame.height=256;frames.push(frame);
    frame.getContext('2d').drawImage(cut,dx,dy,cut.width*scale,cut.height*scale);
   }finally{cut.width=cut.height=0;}
  }
  return {frames,contacts:Object.freeze(r.frames.map(p=>Object.freeze([...p.nativeContact])))};
 }catch(error){for(const frame of frames)frame.width=frame.height=0;throw error;}
 finally{source.width=source.height=0;}
}
