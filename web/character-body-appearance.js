// Colour variants share the exact original geometry, including antialiased
// alpha. Shape changes require a separately authored and registered body.
export function registeredBodyAppearance(body,appearance=body){
 if(appearance===body)return body;
 if(appearance?.width!==256||appearance?.height!==256||typeof appearance.getContext!=='function')throw Error('Body colours require the original prepared frame size.');
 const original=body.getContext('2d').getImageData(0,0,256,256).data,painted=appearance.getContext('2d').getImageData(0,0,256,256).data;
 for(let offset=3;offset<original.length;offset+=4)if(original[offset]!==painted[offset])throw Error('Body colours must preserve every original alpha pixel.');
 return appearance;
}
