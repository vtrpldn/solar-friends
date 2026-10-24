import {bodyMaterialPalettes} from './character-materials.js';
const preparedSources=new WeakMap();

export async function prepareClothingColourSource({image,sourceHash,colour}){
 validateClothingColour(colour);
 if(image?.naturalWidth!==1254||image?.naturalHeight!==1254||!/^[a-f0-9]{64}$/.test(sourceHash??''))throw Error('Prepare colours from a complete registered garment image.');
 let canvas=null,url=null,decoded=null;
 try{
  if(colour!=='cream'){
   canvas=document.createElement('canvas');canvas.width=canvas.height=1254;
   const context=canvas.getContext('2d');context.drawImage(image,0,0);
   const tinted=tintClothingPixels(context.getImageData(0,0,1254,1254),colour);
   context.putImageData(new ImageData(tinted.data,1254,1254),0,0);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Garment colour encoding failed.')),'image/png'));
   url=URL.createObjectURL(blob);decoded=new Image();decoded.src=url;await decoded.decode();
  }
  const token=Object.freeze({colour,dispose(){const state=preparedSources.get(token);if(!state||state.disposed)return;state.disposed=true;if(state.url)URL.revokeObjectURL(state.url);if(state.decoded)state.decoded.src='';}});
  preparedSources.set(token,{original:image,sourceHash,image:decoded??image,decoded,url,disposed:false});return token;
 }catch(error){if(url)URL.revokeObjectURL(url);if(decoded)decoded.src='';throw error;}
 finally{if(canvas)canvas.width=canvas.height=0;}
}

export function clothingColourImage(token,image,sourceHash){
 if(token===undefined)return image;
 const state=preparedSources.get(token);
 if(!state||state.disposed||state.original!==image||state.sourceHash!==sourceHash)throw Error('Use the live colour source prepared for this exact garment.');
 return state.image;
}

// Runtime material treatment only: retain source geometry, alpha and shading.
// Input buffers are borrowed and never modified, including transparent RGB.
export function validateClothingColour(colour){
 const palette=bodyMaterialPalettes.shirt;
 if(typeof colour!=='string'||colour==='reference'||!Object.hasOwn(palette,colour))throw Error('Choose a supported shirt colour.');
 return colour;
}
export function tintClothingPixels(pixels,colour='cream'){
 validateClothingColour(colour);const palette=bodyMaterialPalettes.shirt;
 if(!Number.isSafeInteger(pixels?.width)||!Number.isSafeInteger(pixels?.height)||pixels.width<1||pixels.height<1||pixels.width>1254||pixels.height>1254||!(pixels.data instanceof Uint8ClampedArray)||pixels.data.length!==pixels.width*pixels.height*4)throw Error('Provide bounded garment RGBA pixels.');
 const data=new Uint8ClampedArray(pixels.data);
 if(colour!=='cream')for(let offset=0;offset<data.length;offset+=4){
  if(!data[offset+3])continue;
  for(let channel=0;channel<3;channel++)data[offset+channel]=pixels.data[offset+channel]*palette[colour][channel]/palette.reference[channel];
 }
 return {width:pixels.width,height:pixels.height,data};
}
