// Ask the live renderer to frame a cell. Never duplicate camera/grid constants.
// The caller still exercises normal pointer input and asserts native outcomes.
export async function worldPoint(page,x,y){
 return page.evaluate(({x,y})=>{
  const point=window.solarDev.frameCell(x,y),box=document.querySelector('#world').getBoundingClientRect();
  return {x:box.left+point.x,y:box.top+point.y};
 },{x,y});
}
