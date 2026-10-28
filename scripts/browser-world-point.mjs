// Ask the live renderer to frame a cell. Never duplicate camera/grid constants.
// The caller still exercises normal pointer input and asserts native outcomes.
export async function worldPoint(page,x,y){
 return page.evaluate(({x,y})=>{
  const canvas=document.querySelector('#world'),box=canvas.getBoundingClientRect();let focus=null;
  for(const fy of [.5,.3,.65,.2]){
   for(const fx of [.5,.25,.75,.15,.85]){
    if(document.elementFromPoint(box.left+box.width*fx,box.top+box.height*fy)===canvas){focus={x:fx,y:fy};break;}
   }
   if(focus)break;
  }
  if(!focus)throw Error('No unobstructed world point is available; close the covering panel before interacting.');
  const point=window.solarDev.frameCell(x,y,focus),result={x:box.left+point.x,y:box.top+point.y};
  if(document.elementFromPoint(result.x,result.y)!==canvas)throw Error('The framed world point is covered by a game control.');
  return result;
 },{x,y});
}
