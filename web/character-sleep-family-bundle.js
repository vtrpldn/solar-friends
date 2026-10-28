import {bundledSleepFamily as descriptor} from './character-sleep-family-bundle-index.js';
import {loadCharacterImageSource} from './character-image-source.js';
import {prepareBodyFamily} from './character-body-family.js';
import {prepareFamilyAppearanceLibrary} from './character-family-appearance.js';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
async function definition(){
 const response=await fetch(descriptor.url);if(!response.ok)throw Error('Cannot load this resident artwork revision.');
 const reader=response.body?.getReader();if(!reader)throw Error('Cannot read this resident artwork revision.');const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>descriptor.maximumBytes){await reader.cancel();throw Error('Resident registrations exceed their limit.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==descriptor.sha256)throw Error('This resident artwork revision changed.');
 const data=JSON.parse(new TextDecoder().decode(bytes));
 if(!exact(data,['schema','id','bodySources','sources','ownership','materials','owners','equipment','accessories','workEquipment','clothing'])||data.schema!==3||data.id!==descriptor.id||!exact(data.bodySources,['base','idle','activities','walk','sleep'])||!data.sources||Object.keys(data.sources).length!==136||!Array.isArray(data.workEquipment)||data.workEquipment.length!==4||!Array.isArray(data.clothing)||data.clothing.length!==48||data.accessories?.schema!==2)throw Error('This complete resident family is unavailable.');
 for(const [file,source]of Object.entries(data.sources))if(!/^[a-z0-9-]+\.png$/.test(file)||!exact(source,['url','sha256'])||!/^\/art\/characters\/(?:prototype-v1|relaxed-v1|relaxed-work-v1|relaxed-shirt-v1|relaxed-sleep-v1)\/[a-z0-9-]+\.png$/.test(source.url)||!/^[a-f0-9]{64}$/.test(source.sha256))throw Error('Use only the closed resident artwork catalog.');
 for(const file of Object.values(data.bodySources))if(!Object.hasOwn(data.sources,file))throw Error('The resident body source is missing.');return data;
}
// Kept separate from older immutable bundles; only explicit v5/v6 recipes select it.
async function prepare(options,clothed){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['maxEntries','maxConcurrent','maxQueued'].includes(key)))throw Error('Choose bounded resident cache options.');
 options={...options};const data=await definition(),cache=new Map(),ownedSources=new Set(),sources={};let family=null,library=null;
 const load=file=>{
  if(typeof file!=='string'||!Object.hasOwn(data.sources,file))return Promise.reject(Error('This resident source is not bundled.'));
  if(!cache.has(file)){const source=data.sources[file];cache.set(file,loadCharacterImageSource(source.url).then(value=>{ownedSources.add(value);if(value.sourceHash!==source.sha256)throw Error('Resident source pixels changed.');return value;}));}return cache.get(file);
 };
 try{
  for(const [id,file]of Object.entries(data.bodySources))sources[id]=await load(file);
  family=await prepareBodyFamily({ownership:data.ownership,sources});library=await prepareFamilyAppearanceLibrary({...options,family,materials:data.materials,owners:data.owners,equipment:data.equipment,accessories:data.accessories,workEquipment:data.workEquipment,...(clothed?{clothing:data.clothing}:{}),load});
 }catch(error){await Promise.allSettled([...cache.values()]);await library?.dispose();family?.dispose();for(const source of ownedSources)source.dispose?.();ownedSources.clear();cache.clear();throw error;}
 cache.clear();let closing=null;
 return Object.freeze({id:descriptor.id,acquire:recipe=>library.acquire(recipe),info:()=>library.info(),dispose(){if(!closing)closing=library.dispose().finally(()=>{family.dispose();for(const source of ownedSources)source.dispose?.();ownedSources.clear();cache.clear();});return closing;}});
}
export function prepareBundledSleepResidentFamily(options={}){return prepare(options,false);}
export function prepareBundledSleepShirtResidentFamily(options={}){return prepare(options,true);}
