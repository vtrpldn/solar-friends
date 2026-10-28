// Compose whole registered layers with integer translations. Native body units
// and contacts stay unchanged; only transparent canvas margins may grow.
export function composeResidentFrame(body,layers=[]){
 if(body?.width!==256||body?.height!==256||!Array.isArray(layers)||layers.length>8)throw Error('Use a native body and bounded accessory layers.');
 const draws=[{frame:body,offset:[0,0]}];
 for(const layer of layers){
  const origin=layer?.origin??[0,0],extended=layer?.origin!==undefined;
  if(!layer||!Number.isSafeInteger(layer.frame?.width)||!Number.isSafeInteger(layer.frame?.height)||layer.frame.width<256||layer.frame.height<256||layer.frame.width>512||layer.frame.height>512||!extended&&(layer.frame.width!==256||layer.frame.height!==256)||!Array.isArray(origin)||origin.length!==2||Array.from(origin).some(n=>!Number.isSafeInteger(n)||n>0||n< -128)||origin[0]+layer.frame.width<256||origin[1]+layer.frame.height<256||!Array.isArray(layer.offset)||layer.offset.length!==2||layer.offset.some(n=>!Number.isSafeInteger(n)||Math.abs(n)>128))throw Error('Use native accessory frames and integer translations.');
  draws.push({frame:layer.frame,offset:layer.offset.map((n,i)=>n+origin[i])});
 }
 const left=Math.min(...draws.map(d=>d.offset[0])),top=Math.min(...draws.map(d=>d.offset[1])),right=Math.max(...draws.map(d=>d.offset[0]+d.frame.width)),bottom=Math.max(...draws.map(d=>d.offset[1]+d.frame.height));
 if(left< -128||top< -128||right-left>512||bottom-top>512)throw Error('Keep accessory composition within its frame budget.');
 const frame=document.createElement('canvas');frame.width=right-left;frame.height=bottom-top;
 try{const ctx=frame.getContext('2d');for(const draw of draws)ctx.drawImage(draw.frame,draw.offset[0]-left,draw.offset[1]-top);return {frame,origin:[left,top]};}catch(error){frame.width=frame.height=0;throw error;}
}
