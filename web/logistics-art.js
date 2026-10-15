// Small crates share the village's orthographic axes and warm wood palette.
function crate(ctx,x,y,s,night=0){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.filter=`brightness(${1-night*.45})`;
  ctx.fillStyle=`rgba(43,47,28,${.2+night*.08})`;ctx.beginPath();ctx.ellipse(0,3,9,4,0,0,Math.PI*2);ctx.fill();
  const face=(points,a,b)=>{const color=ctx.createLinearGradient(0,-10,0,3);color.addColorStop(0,a);color.addColorStop(1,b);ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
  face([[-8,-8],[0,-4],[0,3],[-8,-1]],'#b78043','#916235');
  face([[0,-4],[8,-8],[8,-1],[0,3]],'#9f713d','#75502e');
  face([[-8,-8],[0,-12],[8,-8],[0,-4]],'#d8b375','#bd9258');
  ctx.strokeStyle='#e1bc7c99';ctx.lineWidth=.7;for(const y of [-6,-3]){ctx.beginPath();ctx.moveTo(-7,y);ctx.lineTo(-1,y+3);ctx.stroke();ctx.beginPath();ctx.moveTo(1,y+3);ctx.lineTo(7,y);ctx.stroke();}
  ctx.strokeStyle='#775733';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-2,-10.8);ctx.lineTo(5.8,-6.9);ctx.stroke();

  ctx.restore();
}
export function drawCarriedMaterials(ctx,p,scale,facing,night){crate(ctx,p.x+facing*7*scale,p.y-21*scale,scale*.75,night);}
export function drawSupplyPile(ctx,p,scale,units,night){
  const count=Math.min(3,Math.ceil(units/12));
  for(let i=0;i<count;i++)crate(ctx,p.x+(i%2?7:-5)*scale,p.y+(i>1?-7:0)*scale,scale*.8,night);
}
function pail(ctx,x,y,s,kind,night){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.filter=`brightness(${1-night*.45})`;
  ctx.fillStyle='#283c2c33';ctx.beginPath();ctx.ellipse(0,2.5,6,2.5,0,0,Math.PI*2);ctx.fill();
  const wood=ctx.createLinearGradient(-5,-7,5,0);wood.addColorStop(0,'#bd945d');wood.addColorStop(.45,'#997447');wood.addColorStop(1,'#6c5437');
  ctx.fillStyle=wood;ctx.beginPath();ctx.moveTo(-5,-6);ctx.lineTo(-3.8,2);ctx.quadraticCurveTo(0,4,3.8,2);ctx.lineTo(5,-6);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#dfc291';ctx.lineWidth=.65;for(const n of [-2.5,0,2.5]){ctx.beginPath();ctx.moveTo(n,-5);ctx.lineTo(n*.8,2);ctx.stroke();}
  ctx.strokeStyle=kind==='irrigation'?'#607849':'#4d8297';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-4.3,-1);ctx.quadraticCurveTo(0,1,4.3,-1);ctx.stroke();
  ctx.fillStyle=kind==='irrigation'?'#879769':'#84b5bb';ctx.beginPath();ctx.ellipse(0,-6,4.6,2.1,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d1ad78';ctx.lineWidth=.9;ctx.stroke();
  ctx.strokeStyle='#5f4b30';ctx.lineWidth=.85;ctx.beginPath();ctx.ellipse(0,-7.5,4,4,0,Math.PI,Math.PI*2);ctx.stroke();ctx.restore();
}
export function drawCarriedWater(ctx,p,scale,facing,kind,night){pail(ctx,p.x+facing*9*scale,p.y-15*scale,scale*.8,kind,night);}
export function drawWaterPile(ctx,p,scale,tank,night){let slot=0;for(const [i,kind]of ['fresh','irrigation'].entries())for(let n=0;n<Math.min(2,Math.ceil(tank.water[i]/12));n++){pail(ctx,p.x+(slot%2?6:-4)*scale,p.y+(slot>1?-5:0)*scale,scale,kind,night);slot++;}}
