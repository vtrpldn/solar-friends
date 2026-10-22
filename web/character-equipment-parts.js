// Authored atlas regions and integer translations reuse painted equipment.
// No per-part scaling, rotation, silhouette fitting, image rewriting or hand snapping.
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const filename=value=>typeof value==='string'&&/^[a-z0-9-]+\.png$/.test(value);
export function validateEquipmentParts(registration){
 if(registration?.schema!==2||!Array.isArray(registration.parts)||registration.parts.length<1||registration.parts.length>4)throw Error('Choose a bounded equipment part recipe.');
 const ids=new Set(),size=registration.source?.width;
 for(const part of registration.parts){
  if(!exact(part,['id','file','source','rect','offset'])||!filename(part.file)||typeof part.id!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(part.id)||ids.has(part.id)||!exact(part.source,['sha256','width','height'])||!/^[a-f0-9]{64}$/.test(part.source.sha256)||part.source.width!==size||part.source.height!==size||!Number.isInteger(size)||size<256||size>2048||!Array.isArray(part.rect)||part.rect.length!==4||!Array.isArray(part.offset)||part.offset.length!==2||[...part.rect,...part.offset].some(n=>!Number.isSafeInteger(n)))throw Error('This equipment part recipe is not registered.');
  const [x,y,w,h]=part.rect,[dx,dy]=part.offset;
  if(x<0||y<0||w<=0||h<=0||x+w>size||y+h>size||x+dx<0||y+dy<0||x+dx+w>size||y+dy+h>size)throw Error('Equipment regions must stay inside the shared frame.');
  ids.add(part.id);
 }
 const first=registration.parts[0];
 if(first.file!==registration.file||first.source.sha256!==registration.source.sha256||registration.source.height!==size)throw Error('Equipment primary source differs from its recipe.');
 return registration.parts;
}
export async function loadEquipmentArt(registration,load){
 if(!filename(registration?.file))throw Error('Choose bundled equipment artwork.');
 if(registration.schema===1){if(Object.hasOwn(registration,'parts'))throw Error('Equipment parts require a versioned recipe.');return load(registration.file);}
 const parts=validateEquipmentParts(registration);
 const root=await load(registration.file);
 const loaded=await Promise.all(parts.map(async part=>({...await load(part.file),file:part.file})));
 return {...root,parts:loaded};
}
export function paintEquipmentArt(equipment,registration){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
 if(registration.schema===1){
  if(Object.hasOwn(registration,'parts'))throw Error('Equipment parts require a versioned recipe.');
  ctx.drawImage(equipment.image,0,0,256,256);return canvas;
 }
 const parts=validateEquipmentParts(registration);
 if(!Array.isArray(equipment.parts)||equipment.parts.length!==parts.length)throw Error('Equipment recipe sources are incomplete.');
 const assembly=document.createElement('canvas');assembly.width=registration.source.width;assembly.height=registration.source.height;const source=assembly.getContext('2d');
 for(const [index,part]of parts.entries()){
  const loaded=equipment.parts[index];
  if(loaded?.file!==part.file||loaded.sourceHash!==part.source.sha256||loaded.image?.naturalWidth!==part.source.width||loaded.image?.naturalHeight!==part.source.height)throw Error('Equipment part pixels differ from their registered source.');
  const [x,y,w,h]=part.rect,[dx,dy]=part.offset;
  source.drawImage(loaded.image,x,y,w,h,x+dx,y+dy,w,h);
 }
 // Assemble at integer source coordinates, then normalize the whole frame once.
 // Scaling individual cropped regions can change their resampling phase.
 ctx.drawImage(assembly,0,0,256,256);assembly.width=assembly.height=1;
 return canvas;
}
