import {createBodyForegroundLayers} from './character-foreground.js';

// Insert equipment behind registered original hand pixels while retaining all
// composed hair/hat margins and the appearance's existing native origin.
export async function composeEquipmentAppearance({body,binding,mask,sheet,index,appearance,origin=[0,0],equipment}){
 if(!Array.isArray(origin)||origin.length!==2||origin.some(n=>!Number.isSafeInteger(n)||n>0||n< -128)||!appearance||![appearance.width,appearance.height].every(n=>Number.isInteger(n)&&n>=256&&n<=512)||appearance.width+origin[0]<256||appearance.height+origin[1]<256||equipment?.width!==256||equipment?.height!==256)throw Error('Use equipment and appearance in the same native coordinate space.');
 const nativeOrigin=[...origin],width=appearance.width,height=appearance.height;
 // Snapshot before asynchronous body verification; a caller may reuse its tint
 // canvas while the exact original body digest is being checked.
 const pixels=appearance.getContext('2d').getImageData(0,0,width,height);
 let layers=null,result=null;
 try{
  layers=await createBodyForegroundLayers({body,binding,mask,sheet,index});
  const front=layers.front.getContext('2d').getImageData(0,0,256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const hand=(y*256+x)*4;if(!front.data[hand+3])continue;
   const at=((y-nativeOrigin[1])*width+x-nativeOrigin[0])*4;
   if(pixels.data[at+3]!==front.data[hand+3])throw Error('Another appearance part changed registered hand geometry.');
   for(let c=0;c<4;c++){front.data[hand+c]=pixels.data[at+c];pixels.data[at+c]=0;}
  }
  layers.front.getContext('2d').putImageData(front,0,0);
  result=document.createElement('canvas');result.width=width;result.height=height;
  const ctx=result.getContext('2d');ctx.putImageData(pixels,0,0);ctx.drawImage(equipment,-nativeOrigin[0],-nativeOrigin[1]);ctx.drawImage(layers.front,-nativeOrigin[0],-nativeOrigin[1]);
  return {frame:result,origin:nativeOrigin};
 }catch(error){if(result)result.width=result.height=0;throw error;}
 finally{for(const canvas of [layers?.back,layers?.front])if(canvas)canvas.width=canvas.height=0;}
}
