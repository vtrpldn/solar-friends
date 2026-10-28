// Bound encoded bytes while streaming, including responses without Content-Length.
export async function readCharacterBundleBytes(url,{maximumBytes,signal}={}){
 if(!Number.isSafeInteger(maximumBytes)||maximumBytes<1||maximumBytes>64*1024*1024)throw Error('Choose a bounded character source size.');
 signal?.throwIfAborted();
 const response=await fetch(url,{signal,redirect:'error'});
 if(!response.ok)throw Error(`Cannot load character artwork (${response.status}).`);
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maximumBytes)){await response.body?.cancel();throw Error('Character source exceeds its encoded size limit.');}
 const reader=response.body?.getReader();if(!reader)throw Error('Cannot read character source.');
 const chunks=[];let size=0,complete=false;
 try{
  while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done){complete=true;break;}size+=value.byteLength;if(size>maximumBytes)throw Error('Character source exceeds its encoded size limit.');chunks.push(value);}
 }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
 signal?.throwIfAborted();const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
