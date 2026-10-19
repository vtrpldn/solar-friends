// Grid-registered service overlays share the same ground projection as roads.
export function paintUtilityRoute(ctx,iso,scale,plan,color,dashed,{pump=false}={}){
  const points=[plan.start.edge,...plan.cells,plan.end.edge].map(([x,y])=>iso(x,y));
  ctx.strokeStyle='#263d32bb';ctx.lineWidth=Math.max(3,5*scale);ctx.setLineDash([]);ctx.beginPath();
  points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.5,2.5*scale);ctx.setLineDash(dashed?[6*scale,4*scale]:[]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#d9ba7f';ctx.strokeStyle='#5f492c';ctx.lineWidth=1;
  for(const p of pump?[points[1]]:[points[0],points.at(-1)]){
    ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,5*scale),0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(p.x-3*scale,p.y);ctx.lineTo(p.x+3*scale,p.y);ctx.stroke();
    ctx.strokeStyle='#5f492c';
  }
}
