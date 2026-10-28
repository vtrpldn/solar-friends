// Stage a cast without unpinning the live village. Only a completed batch installs.
export async function prepareResidentArtwork(appearances,library,{signal,onProgress=()=>{}}={}){
 if(!Array.isArray(appearances)||appearances.length>12||typeof onProgress!=='function')throw Error('Prepare at most twelve resident appearances.');
 const inputs=structuredClone(appearances),providers=new Array(inputs.length);let next=0,completed=0,stopped=false,onAbort;
 const abort=()=>new DOMException('Resident artwork preparation cancelled.','AbortError');
 if(signal?.aborted)throw abort();
 const cancelled=new Promise((_,reject)=>{onAbort=()=>{stopped=true;reject(abort());};signal?.addEventListener('abort',onAbort,{once:true});});
 try{
  onProgress({completed,total:inputs.length});
  const worker=async()=>{
   while(!stopped&&next<inputs.length){
    const index=next++;
    try{providers[index]=await library.prepare(inputs[index]);}catch(error){stopped=true;throw error;}
    if(stopped)return;completed++;onProgress({completed,total:inputs.length});
   }
  };
  await Promise.race([Promise.all(Array.from({length:Math.min(2,inputs.length)},worker)),cancelled]);
  if(stopped||signal?.aborted)throw abort();
  return library.installPrepared(inputs,providers);
 }finally{stopped=true;signal?.removeEventListener('abort',onAbort);}
}
