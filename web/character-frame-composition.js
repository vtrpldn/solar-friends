// Compose whole registered layers with integer translations. Native body units
// and contacts stay unchanged; only transparent canvas margins may grow.
export function composeResidentFrame(body,layers=[]){
 if(body?.width!==256||body?.height!==256||!Array.isArray(layers)||layers.length>8)throw Error('Use a native body and bounded accessory layers.');
 const draws=[{frame:body,offset:[0,0]}];
 for(const layer of layers){
  if(!layer||layer.frame?.width!==256||layer.frame?.height!==256||!Array.isArray(layer.offset)||layer.offset.length!==2||layer.offset.some(n=>!Number.isSafeInteger(n)||Math.abs(n)>128))throw Error('Use native accessory frames and integer translations.');
  draws.push({frame:layer.frame,offset:[...layer.offset]});
 }
 const left=Math.min(...draws.map(d=>d.offset[0])),top=Math.min(...draws.map(d=>d.offset[1])),right=Math.max(...draws.map(d=>d.offset[0]+256)),bottom=Math.max(...draws.map(d=>d.offset[1]+256));
 if(right-left>512||bottom-top>512)throw Error('Keep accessory composition within its frame budget.');
 const frame=document.createElement('canvas');frame.width=right-left;frame.height=bottom-top;
 try{const ctx=frame.getContext('2d');for(const draw of draws)ctx.drawImage(draw.frame,draw.offset[0]-left,draw.offset[1]-top);return {frame,origin:[left,top]};}catch(error){frame.width=frame.height=0;throw error;}
}
