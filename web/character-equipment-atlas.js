import {canonical} from './editor/journal.js';

const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const key=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const sheets=['base','idle','activities'];

// All parts share one authored scale. Offsets are explicit native coordinates;
// no fitting, rotation, per-part scaling or substitutions occur at runtime.
export function paintRegisteredEquipmentAtlas({binding,registration,sources,sheet,index}){
 const r=structuredClone(registration);
 if(!exact(r,['schema','body','scale','sources','poses'])||r.schema!==1||canonical(r.body)!==canonical(binding)||!Number.isFinite(r.scale)||r.scale<=0||r.scale>1||!r.sources||Array.isArray(r.sources)||Object.keys(r.sources).length<1||Object.keys(r.sources).length>8||!Array.isArray(r.poses)||r.poses.length<1||r.poses.length>48||!sources||Object.keys(sources).sort().join(',')!==Object.keys(r.sources).sort().join(','))throw Error('Use a complete registered equipment atlas.');
 for(const [id,s]of Object.entries(r.sources)){
  const loaded=sources[id];
  if(!key(id)||!exact(s,['sha256','width','height'])||!/^[a-f0-9]{64}$/.test(s.sha256)||![s.width,s.height].every(n=>Number.isInteger(n)&&n>=256&&n<=2048)||loaded?.sourceHash!==s.sha256||loaded?.image?.naturalWidth!==s.width||loaded?.image?.naturalHeight!==s.height)throw Error('Equipment atlas source identity changed.');
 }
 const seen=new Set();let selected=null;
 for(const p of r.poses){
  const id=`${p?.sheet}:${p?.index}`;
  if(!exact(p,['sheet','index','parts'])||!sheets.includes(p.sheet)||!Number.isInteger(p.index)||p.index<0||p.index>15||seen.has(id)||!Array.isArray(p.parts)||p.parts.length<1||p.parts.length>8)throw Error('Declare unique bounded equipment poses.');
  seen.add(id);
  for(const part of p.parts){
   const s=Object.hasOwn(r.sources,part?.source)?r.sources[part.source]:null;
   if(!exact(part,['source','rect','offset'])||!s||!Array.isArray(part.rect)||part.rect.length!==4||!part.rect.every(Number.isSafeInteger)||!Array.isArray(part.offset)||part.offset.length!==2||!part.offset.every(n=>Number.isFinite(n)&&n>=-128&&n<=384))throw Error('Declare registered equipment regions.');
   const [x,y,w,h]=part.rect;
   if(x<0||y<0||w<=0||h<=0||x+w>s.width||y+h>s.height||part.offset[0]+w*r.scale>384||part.offset[1]+h*r.scale>384)throw Error('Equipment regions exceed their registered bounds.');
  }
  if(p.sheet===sheet&&p.index===index)selected=p;
 }
 if(!selected)throw Error('This equipment pose is not registered.');
 const probe=document.createElement('canvas');probe.width=probe.height=512;
 let result=null;
 try{
  const ctx=probe.getContext('2d');
  for(const part of selected.parts){const [x,y,w,h]=part.rect;ctx.drawImage(sources[part.source].image,x,y,w,h,part.offset[0]+128,part.offset[1]+128,w*r.scale,h*r.scale);}
  const pixels=ctx.getImageData(0,0,512,512).data;
  for(let y=0;y<512;y++)for(let x=0;x<512;x++)if((x<128||x>=384||y<128||y>=384)&&pixels[(y*512+x)*4+3])throw Error('Equipment paint exceeds the native body frame.');
  result=document.createElement('canvas');result.width=result.height=256;
  result.getContext('2d').drawImage(probe,128,128,256,256,0,0,256,256);
  return result;
 }catch(error){if(result)result.width=result.height=0;throw error;}
 finally{probe.width=probe.height=0;}
}
