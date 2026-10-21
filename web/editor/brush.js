// Rasterize pointer samples in world cells. Bound coordinates before walking
// so a pointer dragged far outside the canvas cannot create an unbounded loop.
export function strokeCells(from,to,size=64){
  const clip=n=>Math.max(0,Math.min(size-1,Math.round(n)));
  if(![...from,...to].every(Number.isFinite))return [];
  let [x,y]=from.map(clip);const [endX,endY]=to.map(clip),cells=[];
  const dx=Math.abs(endX-x),dy=-Math.abs(endY-y),sx=x<endX?1:-1,sy=y<endY?1:-1;
  let error=dx+dy;
  for(;;){cells.push([x,y]);if(x===endX&&y===endY)break;const twice=2*error;if(twice>=dy){error+=dy;x+=sx;}if(twice<=dx){error+=dx;y+=sy;}}
  return cells;
}
export function clearingStroke(existing,cells,size){
  const result=existing.map(c=>({...c}));
  for(const [x,y]of cells){
    const c={x,y,size,disturbance:.05},left=x-Math.floor(size/2),top=y-Math.floor(size/2);
    if(left<0||top<0||left+size>64||top+size>64)continue;
    // A larger existing clearing already fully covers this stamp.
    if(result.some(p=>{const px=p.x-Math.floor(p.size/2),py=p.y-Math.floor(p.size/2);return px<=left&&py<=top&&px+p.size>=left+size&&py+p.size>=top+size;}))continue;
    result.push(c);
  }
  if(result.length>64)throw Error('This property supports 64 clearing stamps. Use a larger brush or undo a previous clearing.');
  return result;
}
