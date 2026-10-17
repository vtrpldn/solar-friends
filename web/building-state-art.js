// Shared by the village and artwork inspector; overlays stay in map space.
export function constructionOpacity(complete,work,stage=0,stages=1){
 return work?.stage==='rebuild'?.45:complete?1:.16+.65*(stage/stages);
}
export function drawBuildingState(ctx,{work,complete,progress,point,corners,scale,kind,stage=0,label='Blueprint'}){
 if(complete&&!work)return;
 const {x,y}=point,s=scale;ctx.save();
 const text=message=>{ctx.strokeStyle='#314338';ctx.lineWidth=2.5*s;ctx.lineJoin='round';ctx.strokeText(message,x,y+30*s);ctx.fillText(message,x,y+30*s);};
 if(work){
  const total=work.stage==='pack'?24:work.stage==='rebuild'?36:work.action==='demolish'?18:54;
  ctx.fillStyle='#f6e7be';ctx.font=`${10*s}px Georgia`;ctx.textAlign='center';
  text(work.stage==='pack'?'Packing':work.stage==='rebuild'?'Rebuilding':work.action==='salvage'?'Salvaging':'Demolishing');
  ctx.fillRect(x-28*s,y+9*s,56*s,5*s);ctx.fillStyle='#9b7447';ctx.fillRect(x-28*s,y+9*s,56*s*work.work/total,5*s);
 }else if(!complete){
  const height=(kind==='garden'?15:stage===0?20:65)*s;
  for(let i=0;i<corners.length;i++){
   const a=corners[i],b=corners[(i+1)%corners.length];
   ctx.strokeStyle='#ae8757';ctx.lineWidth=2.5*s;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x,a.y-height);ctx.stroke();
   ctx.strokeStyle='#bd965f';ctx.beginPath();ctx.moveTo(a.x,a.y-height);ctx.lineTo(b.x,b.y-height);ctx.stroke();
  }
  ctx.fillStyle='#fffcf0';ctx.font=`${10*s}px 'DM Sans',sans-serif`;ctx.textAlign='center';text(label);
  ctx.fillRect(x-27*s,y+9*s,54*s,5*s);ctx.fillStyle='#7c9859';ctx.fillRect(x-27*s,y+9*s,54*s*progress/100,5*s);
 }
 ctx.restore();
}
