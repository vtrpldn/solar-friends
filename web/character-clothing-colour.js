import {bodyMaterialPalettes} from './character-materials.js';

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
