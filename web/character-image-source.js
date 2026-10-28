import {readCharacterBundleBytes} from './character-bundle-response.js';
// Hash and decode the same bounded response. Verify PNG dimensions before decode
// so a small encoded source cannot allocate an unbounded image surface.
export async function loadCharacterImageSource(url,{maximumBytes=16*1024*1024,sha256,width,height,signal}={}){
 if(sha256!==undefined&&!/^[a-f0-9]{64}$/.test(sha256)||[width,height].some(n=>n!==undefined&&(!Number.isSafeInteger(n)||n<1||n>2048)))throw Error('Use registered character source metadata.');
 const bytes=await readCharacterBundleBytes(url,{maximumBytes,signal});
 const sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(sha256!==undefined&&sha256!==sourceHash)throw Error('Character source pixels changed.');
 const signature=[137,80,78,71,13,10,26,10],view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<33||signature.some((n,i)=>bytes[i]!==n)||view.getUint32(8)!==13||view.getUint32(12)!==0x49484452)throw Error('Use a registered PNG character source.');
 const w=view.getUint32(16),h=view.getUint32(20);
 if(w<1||h<1||w>2048||h>2048||width!==undefined&&width!==w||height!==undefined&&height!==h)throw Error('Character source dimensions changed or exceed their limit.');
 signal?.throwIfAborted();const objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'})),image=new Image();let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;image.src='';};
 const abort=()=>dispose();signal?.addEventListener('abort',abort,{once:true});
 try{
  image.src=objectUrl;
  try{await image.decode();}catch(cause){signal?.throwIfAborted();throw Error(`Cannot decode character artwork (${url}).`,{cause});}
  signal?.throwIfAborted();if(image.naturalWidth!==w||image.naturalHeight!==h)throw Error('Decoded character source dimensions changed.');
  return {image,sourceHash,dispose};
 }catch(error){dispose();throw error;}
 finally{signal?.removeEventListener('abort',abort);URL.revokeObjectURL(objectUrl);}
}
