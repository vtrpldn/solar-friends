import {bundledShirt} from './character-shirt-bundle-index.js';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
// Only the installed descriptor is accepted; imported residents cannot select URLs.
export async function loadBundledShirtDefinition(){
 const response=await fetch(bundledShirt.url);if(!response.ok)throw Error('Cannot load the bundled shirt.');
 const reader=response.body?.getReader();if(!reader)throw Error('Cannot read bundled shirt registrations.');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>bundledShirt.maximumBytes){await reader.cancel();throw Error('Bundled shirt registrations exceed their limit.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==bundledShirt.sha256)throw Error('The bundled shirt revision changed.');
 const data=JSON.parse(new TextDecoder().decode(bytes));
 if(!exact(data,['schema','id','sources','garments'])||data.schema!==1||data.id!==bundledShirt.id||!data.sources||Array.isArray(data.sources)||Object.keys(data.sources).length>48||!Array.isArray(data.garments)||data.garments.length!==48)throw Error('This bundled shirt is incomplete.');
 for(const [file,source]of Object.entries(data.sources))if(!/^source-[a-f0-9]{64}\.png$/.test(file)||!exact(source,['url','sha256'])||source.url!=='/art/characters/relaxed-shirt-v1/'+file||file!=='source-'+source.sha256+'.png')throw Error('Use only the installed shirt artwork.');
 const poses=new Set(),used=new Set();
 for(const garment of data.garments){
  const r=garment?.registration;
  if(!exact(garment,['file','registration'])||!Object.hasOwn(data.sources,garment.file)||r?.reviewSchema!==1||r.part!=='short-sleeve-v1'||!['base','idle','activities'].includes(r.sheet)||!Number.isInteger(r.index)||r.index<0||r.index>15||r.source?.sha256!==data.sources[garment.file].sha256)throw Error('This bundled shirt pose is unavailable.');
  const key=r.sheet+':'+r.index;if(poses.has(key))throw Error('Duplicate bundled shirt pose.');poses.add(key);used.add(garment.file);
 }
 if(used.size!==Object.keys(data.sources).length)throw Error('Bundled shirt includes unused artwork.');
 return data;
}
