// Runtime material colour only. Source paint, pose coordinates and alpha stay
// unchanged; shading comes from the original painted hair's luminance.
export const hairColourPalettes=Object.freeze({chestnut:null,espresso:Object.freeze([114,82,60]),black:Object.freeze([68,64,58]),silver:Object.freeze([232,225,211])});
export function validateHairColour(key){if(typeof key!=='string'||!Object.hasOwn(hairColourPalettes,key))throw Error('This hair colour is unavailable.');return key;}
export function tintHairPixels(pixels,key){
 const colour=hairColourPalettes[validateHairColour(key)];
 if(!Number.isInteger(pixels?.width)||!Number.isInteger(pixels?.height)||pixels.width<1||pixels.height<1||pixels.width>1254||pixels.height>1254||pixels.data?.length!==pixels.width*pixels.height*4)throw Error('Use a registered hair-only image.');
 if(!colour)return pixels;
 const data=new Uint8ClampedArray(pixels.data);
 for(let p=0;p<data.length;p+=4){if(!data[p+3])continue;const light=.2126*pixels.data[p]+.7152*pixels.data[p+1]+.0722*pixels.data[p+2],shade=Math.min(1,.18+.82*light/180);for(let channel=0;channel<3;channel++)data[p+channel]=colour[channel]*shade;}
 return {width:pixels.width,height:pixels.height,data};
}
