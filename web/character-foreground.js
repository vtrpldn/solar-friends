import {registeredBodyAppearance} from './character-body-appearance.js';
import {validateBodyForegroundMask} from './character-foreground-mask.js';
export {validateBodyForegroundMask} from './character-foreground-mask.js';
import {composeClothingPose} from './character-clothing.js';
export async function createBodyForegroundLayers({body,binding,mask,sheet,index,appearanceBody,clothing}){
 const checked=validateBodyForegroundMask(mask,binding,sheet,index);
 if(body.width!==256||body.height!==256)throw Error('Foreground layers require the shared prepared body frame.');
 const original=body.getContext('2d').getImageData(0,0,256,256),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',original.data))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==binding.frames[sheet][index])throw Error('The prepared body pixels differ from the foreground mask.');
 const ownership=new Uint8Array(256*256);
 if(checked.schema===2){for(const [start,length]of checked.runs)ownership.fill(1,start,start+length);}
 else{
  const region=document.createElement('canvas');region.width=region.height=256;
  try{const ctx=region.getContext('2d');ctx.save();ctx.scale(256/checked.size,256/checked.size);ctx.beginPath();
  for(const polygon of checked.polygons){ctx.moveTo(...polygon[0]);for(const point of polygon.slice(1))ctx.lineTo(...point);ctx.closePath();}
  ctx.fillStyle='#fff';ctx.fill();ctx.restore();const coverage=ctx.getImageData(0,0,256,256).data;
  for(let pixel=0;pixel<ownership.length;pixel++)ownership[pixel]=Number(coverage[pixel*4+3]>=128);
  }finally{region.width=region.height=0;}
 }
 const painted=registeredBodyAppearance(body,appearanceBody),dressed=clothing?composeClothingPose({...clothing,body,appearanceBody:painted,binding,sheet,index}).frame:null;
 let appearance;try{appearance=(dressed??painted).getContext('2d').getImageData(0,0,256,256);}finally{if(dressed)dressed.width=dressed.height=0;}
 const back=document.createElement('canvas'),front=document.createElement('canvas');back.width=back.height=front.width=front.height=256;
 const backPixels=new ImageData(appearance.data.slice(),256,256),frontPixels=new ImageData(256,256);
 // Disjoint ownership preserves original antialiased edges: never draw the
 // same body pixel in both layers and accidentally double its alpha.
 for(let pixel=0;pixel<256*256;pixel++)if(ownership[pixel])for(let channel=0;channel<4;channel++){frontPixels.data[pixel*4+channel]=appearance.data[pixel*4+channel];backPixels.data[pixel*4+channel]=0;}
 try{back.getContext('2d').putImageData(backPixels,0,0);front.getContext('2d').putImageData(frontPixels,0,0);return {back,front};}
 catch(error){back.width=back.height=front.width=front.height=0;throw error;}
}
