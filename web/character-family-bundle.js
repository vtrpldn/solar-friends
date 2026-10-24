import {bundledFamily} from './character-family-bundle-index.js';
import {loadCharacterImageSource} from './character-image-source.js';
import {prepareBodyFamily} from './character-body-family.js';
import {prepareFamilyAppearanceLibrary} from './character-family-appearance.js';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
async function definition(){
 const response=await fetch(bundledFamily.url);if(!response.ok)throw Error('Cannot load the bundled resident family.');
 const reader=response.body?.getReader();if(!reader)throw Error('Cannot read bundled resident registrations.');const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>bundledFamily.maximumBytes){await reader.cancel();throw Error('Bundled resident registrations exceed their limit.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==bundledFamily.sha256)throw Error('The bundled resident family revision changed.');
 const data=JSON.parse(new TextDecoder().decode(bytes));if(!exact(data,['schema','id','bodySources','sources','ownership','materials','owners','equipment','accessories'])||data.schema!==1||data.id!==bundledFamily.id||!exact(data.bodySources,['base','idle','activities','walk'])||!data.sources||Object.keys(data.sources).length>128)throw Error('This bundled family definition is unavailable.');
 for(const [file,source]of Object.entries(data.sources))if(!/^[a-z0-9-]+\.png$/.test(file)||!exact(source,['url','sha256'])||!/^\/art\/characters\/(?:prototype-v1|relaxed-v1)\/[a-z0-9-]+\.png$/.test(source.url)||!/^[a-f0-9]{64}$/.test(source.sha256))throw Error('Use only the closed bundled family source catalogue.');
 for(const file of Object.values(data.bodySources))if(!Object.hasOwn(data.sources,file))throw Error('The bundled family body source is missing.');return data;
}
// Not yet activated by player recipes. This adapter owns its family and library;
// callers retain appearance leases and must release/dispose them explicitly.
export async function prepareBundledResidentFamily(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['maxEntries','maxConcurrent','maxQueued'].includes(key)))throw Error('Choose only bounded family cache options.');
 options={...options};
 const data=await definition(),cache=new Map(),loaded={};let family=null,library=null;
 const load=file=>{
  if(typeof file!=='string'||!Object.hasOwn(data.sources,file))return Promise.reject(Error('This resident source is not bundled.'));
  if(!cache.has(file)){const source=data.sources[file],work=loadCharacterImageSource(source.url).then(value=>{if(value.sourceHash!==source.sha256)throw Error('Bundled resident source pixels changed.');return value;});cache.set(file,work);}
  return cache.get(file);
 };
 try{
  for(const [id,file]of Object.entries(data.bodySources))loaded[id]=await load(file);
  family=await prepareBodyFamily({ownership:data.ownership,sources:loaded});
  library=await prepareFamilyAppearanceLibrary({...options,family,materials:data.materials,owners:data.owners,equipment:data.equipment,accessories:data.accessories,load});
 }catch(error){await library?.dispose();family?.dispose();cache.clear();throw error;}
 cache.clear();let closing=null;
 return Object.freeze({id:bundledFamily.id,acquire:recipe=>library.acquire(recipe),info:()=>library.info(),dispose(){if(!closing)closing=library.dispose().finally(()=>{family.dispose();cache.clear();});return closing;}});
}
