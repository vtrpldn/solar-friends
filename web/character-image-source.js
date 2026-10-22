// Hash and decode the same response: a second URL request could return different
// artwork after the registration hash was checked.
export async function loadCharacterImageSource(url){
 const response=await fetch(url);
 if(!response.ok)throw Error(`Cannot load character artwork (${response.status}).`);
 const bytes=await response.arrayBuffer();
 const sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
 try{
  const image=new Image();image.src=objectUrl;await image.decode();
  return {image,sourceHash};
 }finally{URL.revokeObjectURL(objectUrl);}
}
