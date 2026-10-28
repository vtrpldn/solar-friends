import {readCharacterBundleBytes} from './character-bundle-response.js';
import {loadCharacterImageSource} from './character-image-source.js';
import {createComposedResidentLibrary} from './character-composed-family.js';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
// Descriptors belong to the game's immutable catalog, never a save or recipe.
// Decoded sources outlive every library lease and are released after it closes.
export async function prepareBundledComposedResidentFamily(descriptor,options={}){
 if(!exact(descriptor,['id','url','sha256'])||typeof descriptor.id!=='string'||typeof descriptor.sha256!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(descriptor.id)||descriptor.url!==`/art/characters/${descriptor.id}/bundle-v1.json`||!/^[a-f0-9]{64}$/.test(descriptor.sha256))throw Error('Choose an immutable resident bundle from the game catalog.');
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['maxEntries','maxConcurrent','maxQueued','signal'].includes(k)))throw Error('Choose bounded resident bundle options.');
 descriptor=Object.freeze({...descriptor});
 const {signal,...cacheOptions}=options,bytes=await readCharacterBundleBytes(descriptor.url,{maximumBytes:6*1024*1024,signal}),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==descriptor.sha256)throw Error('This resident bundle revision changed.');
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(data?.id!==descriptor.id||![1,2,3,4].includes(data.schema)||!data.sources||Array.isArray(data.sources)||Object.keys(data.sources).length<1||Object.keys(data.sources).length>48)throw Error('Use a complete registered resident bundle.');
 for(const [key,s]of Object.entries(data.sources))if(!/^[a-z][a-z0-9-]{0,63}$/.test(key)||!exact(s,['path','sha256'])||typeof s.path!=='string'||s.path.length>512||!/^[a-f0-9]{64}$/.test(s.sha256))throw Error('Use a closed resident source catalog.');
 const sources={},owned=new Map();let library=null;
 try{
  for(const [key,s]of Object.entries(data.sources)){
   signal?.throwIfAborted();let source=owned.get(s.sha256);
   if(!source){source=await loadCharacterImageSource(`/art/characters/${descriptor.id}/source-${s.sha256}.png`,{maximumBytes:4*1024*1024,sha256:s.sha256,signal});owned.set(s.sha256,source);}
   sources[key]=source;
  }
  signal?.throwIfAborted();library=createComposedResidentLibrary({definition:data,sources,...cacheOptions,runtimeRasterBinding:true});
 }catch(error){await library?.dispose();for(const source of owned.values())source.dispose();owned.clear();throw error;}
 let closing=null;
 return Object.freeze({id:descriptor.id,acquire:recipe=>library.acquire(recipe),info:()=>({...library.info(),decodedSources:owned.size}),dispose(){if(!closing)closing=library.dispose().finally(()=>{for(const source of owned.values())source.dispose();owned.clear();});return closing;}});
}
