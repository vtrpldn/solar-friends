// A reclining pose owns an explicit ground contact. The source pixels remain
// intact; only one uniform scale and a translation are permitted.
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function validateContactBodyRegistration(r){
 if(!exact(r,['schema','family','sheet','source','uniformScale','sourceContact','nativeContact'])||r.schema!==1||typeof r.family!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(r.family)||!['base','idle','activities'].includes(r.sheet)||!exact(r.source,['sha256','width','height']))throw Error('Use a complete contact-body registration.');
 if(!/^[a-f0-9]{64}$/.test(r.source.sha256??'')||![r.source.width,r.source.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=4096)||!Number.isFinite(r.uniformScale)||r.uniformScale<=0||r.uniformScale>1)throw Error('Use a bounded, hashed contact-body source and uniform scale.');
 for(const [value,limits]of [[r.sourceContact,[r.source.width,r.source.height]],[r.nativeContact,[256,256]]])if(!Array.isArray(value)||value.length!==2||![value[0],value[1]].every((n,i)=>Number.isFinite(n)&&n>=0&&n<=limits[i]))throw Error('Keep contact landmarks inside their declared source and native frame.');
}
export function prepareContactBodyFrame({image,sourceHash},registration){
 const r=structuredClone(registration);validateContactBodyRegistration(r);
 if(sourceHash!==r.source.sha256||!image?.complete||image.naturalWidth!==r.source.width||image.naturalHeight!==r.source.height)throw Error('Use the exact decoded contact-body source.');
 const source=document.createElement('canvas');source.width=image.naturalWidth;source.height=image.naturalHeight;let frame;
 try{
  const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const {data}=ctx.getImageData(0,0,source.width,source.height);
  let left=source.width,top=source.height,right=0,bottom=0;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(data[(y*source.width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
  if(right<=left||bottom<=top)throw Error('A contact-body source must contain painted pixels.');
  const scale=r.uniformScale,dx=r.nativeContact[0]-r.sourceContact[0]*scale,dy=r.nativeContact[1]-r.sourceContact[1]*scale;
  // Two source pixels of resampling margin retain soft edges at every side.
  if(dx+(left-2)*scale<0||dy+(top-2)*scale<0||dx+(right+2)*scale>256||dy+(bottom+2)*scale>256)throw Error(`The complete reclining silhouette must fit without cropping: source bounds ${[left,top,right,bottom].join(',')}.`);
  frame=document.createElement('canvas');frame.width=frame.height=256;frame.getContext('2d').drawImage(image,dx,dy,source.width*scale,source.height*scale);
  return {frame,contact:Object.freeze([...r.nativeContact]),bounds:Object.freeze([left,top,right,bottom])};
 }catch(error){if(frame)frame.width=frame.height=0;throw error;}
 finally{source.width=source.height=0;}
}
